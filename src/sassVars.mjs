import { promises as fs } from 'fs';
import sassVars from 'get-sass-vars';

export async function runSassVars(files) {
   const css = await fs.readFile(files[0], 'utf-8');
   const json = await sassVars(css);

   console.log(json);
   return json;
}