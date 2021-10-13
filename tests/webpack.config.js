const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const WordPressPaletteWebpackPlugin = require('../src/index.js');
module.exports = {
  entry: { index: path.resolve(__dirname, 'source', 'index.js') },
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: 'babel-loader',
        },
      },
      {
        test: /\.vue$/,
        loader: 'vue-loader',
      },
      {
        test: /\.scss$/,
        exclude: /node_modules/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            options: {
              publicPath: '../',
            },
          },
          {
            loader: 'css-loader',
          },
          {
            loader: 'sass-loader',
          },
        ],
      },
    ],
  },
  output: {
    path: path.resolve(__dirname, 'build'),
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: 'styles/[name].css',
      chunkFilename: '[id].css',
    }),
    new WordPressPaletteWebpackPlugin({
      output: 'palette.json',
      blacklist: ['transparent', 'inherit'],
      pretty: false,
      sass: {
        path: path.resolve(__dirname, 'source'),
        files: ['app.scss'],
        variables: ['colors'],
      },
    }),
  ],
};
