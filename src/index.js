const path = require('path');
const fs = require('fs');
const _ = require('lodash');

class WordPressPaletteWebpackPlugin {
  /**
   * Register the component.
   *
   * @param {Object} options
   */
  constructor(options) {
    this.options = _.merge(
      {
        output: 'theme.json',
        output_prepend: '',
        wp_theme_json: true,
        blacklist: ['transparent', 'inherit'],
        pretty: false,
        sass: {
          path: 'resources/assets/styles/config',
          files: ['variables.scss'],
          variables: ['colors'],
        },
      },
      options || {}
    );

    this.palette = this.sass();
  }

  process_wp_theme_json(palette, theme_json_file) {
    if (fs.existsSync(theme_json_file)) {
      let rawdata = fs.readFileSync(theme_json_file);
      var theme_json = JSON.parse(rawdata);
    } else {
      var theme_json = {
        "$schema": "https://schemas.wp.org/trunk/theme.json",
        version: 2,
        settings: {
          color: {},
        },
      };
    }

    if ('undefined' == typeof theme_json.settings) theme_json.settings = {};
    if ('undefined' == typeof theme_json.settings.color)
      theme_json.settings.color = {};

    theme_json.settings.color.palette = palette;
    return theme_json;
  }

  /**
   * Add Palette to the webpack build process.
   *
   * @param {Object} compiler
   */
  apply(compiler) {
    if (this.options.wp_theme_json) {
      const theme_json_file =
        this.options.output == 'theme.json'
          ? './theme.json'
          : './' + this.options.output;
      // Build the theme.json format. Force pretty printing if we're using wp_theme_json.

      var palette = JSON.stringify(
        this.process_wp_theme_json(this.palette, theme_json_file),
        null,
        2
      );
    } else {
      var palette = JSON.stringify(
        this.palette,
        null,
        this.options.pretty ? 2 : null
      );
    }

    let output_path = this.options.output_prepend + this.options.output;

    if (compiler.hooks) {
      compiler.hooks.thisCompilation.tap(
        this.constructor.name,
        (compilation) => {
          Object.assign(compilation.assets, {
            [this.options.output]: {
              source() {
                return palette;
              },
              size() {
                return palette.length;
              },
            },
          });
        });
    }

  }

  /**
   * Builds a flattened array containing descriptive color objects in a format
   * compatible with the WordPress `editor-color-palette` theme support feature.
   *
   * @see {@link https://developer.wordpress.org/block-editor/developers/themes/theme-support/}
   * @param {Object} objects
   */
  build(...objects) {
    const collection = _.uniqBy(_.union(...objects), 'name');

    const [colors, maybeColors] = _.partition(
      collection,
      (value) => !!d3Color(value.color)
    );
    const [falsePositives, notColors] = _.partition(maybeColors, (value) =>
      /^(?:rgb|hsl)a?\(.+?\)$/i.test(value.color)
    );
    const [grayscale, notGrayscale] = _.partition(
      colors,
      (value) =>
        this.isGrayscale(value.color) || this.maybeGrayscale(value.color)
    );

    return [
      [...notGrayscale, ...falsePositives, ...notColors],
      grayscale,
    ].flatMap((color) => _.sortBy(color, 'name'));
  }

  /**
   * Fetch and parse Sass theme colors if they are available.
   */
  sass() {
    if (!this.options.sass || !this.options.sass.files) {
      return;
    }

    const paths = this.options.sass.path
      ? _.endsWith('/', this.options.sass.path)
        ? this.options.sass.path
        : [this.options.sass.path, '/'].join('')
      : null;

    const files = [this.options.sass.files].map((file) => {
      if (this.exists([paths, file].join(''))) {
        return [paths, file].join('');
      }
    });

    if (!files) {
      return;
    }

    const variables = require('sass-export')
      .exporter({ inputFiles: files })
      .getArray();

    if (!variables.length) {
      return;
    }

    return variables
      .filter(
        (key) =>
          [this.options.sass.variables].some(
            (value) =>
              key.name ===
              (_.startsWith(value, '$') ? value : ['$', value].join(''))
          ) && key.mapValue
      )
      .flatMap((colors) =>
        colors.mapValue.map((color) =>
          this.transform(color.name, color.compiledValue, true)
        )
      );
  }

  /**
   * Transform a color key and value into a more descriptive object.
   *
   * @param {String}  key
   * @param {String}  value
   * @param {Boolean} isSass
   */
  transform(key, value, isSass = false) {
    if (isSass) {
      return {
        name: this.title(key),
        slug: key,
        color: value,
      };
    }
  }

  /**
   * Returns a title cased string.
   *
   * @param {String} value
   * @param {String} description
   */
  title(value, description) {
    value = _.startCase(_.camelCase(value));

    return (
      value + (!_.isEmpty(description) ? ` (${this.title(description)})` : '')
    );
  }

  /**
   * Checks if a file exists.
   *
   * @param {String|Array} files
   */
  exists(files) {
    if (Array.isArray(files) && files.length) {
      return (this.options.sass.files =
        files.filter((file) => {
          return fs.existsSync(file);
        }) || false);
    }

    return fs.existsSync(files);
  }

  /**
   * Check if a color is grayscale.
   *
   * @param {String} color
   */
  isGrayscale(color) {
    const { r, g, b } = d3Color(color);

    return r === g && r === b;
  }

  /**
   * Build a curve to find colors that visually look like grayscale.
   *
   * Shout out to Austin Pray <austin@austinpray.com>
   * for the big brain plays on color sorting.
   *
   * @param {String} color
   */
  maybeGrayscale(color) {
    // async run https://github.com/pex-gl/pex-color/

    async function pexColor(color) {
      await import('pex-color').then(({ hsv }) => {
        var color = hsv(color);
        return color;
      });
    }



    const { h, s, v } = pexColor(color);

    /**
     * HSV is a cylinder where the central vertical axis comprises
     * the neutral, achromatic, or gray colors.
     * (image: https://w.wiki/Fsg)
     *
     * Let's build a curve to find colors that look like grayscale...
     *
     * v = 1.3/(1+8.5*s)
     * https://www.wolframalpha.com/input/?i=plot+v+%3D+1.3%2F%281%2B8.5*s%29+from+v%3D0+to+1+and+s%3D0+to+1
     *
     * Good enough for government work. Now let's see if the value
     * falls below the curve.
     */
    return v < 1.3 / (1 + 8.5 * s);
  }

  async d3Color(color) {
    await import('d3-color').then(({ color: d3Color }) => {
      var color = d3Color(color);
      return color;
    });
  }
}

module.exports = WordPressPaletteWebpackPlugin;
