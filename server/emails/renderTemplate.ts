import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

const cache = new Map<string, HandlebarsTemplateDelegate>();
const TEMPLATES_DIR = path.join(process.cwd(), 'server', 'emails', 'templates');

export function renderTemplate(name: string, data: Record<string, unknown>): string {
  let fn = cache.get(name);
  if (!fn) {
    const filePath = path.join(TEMPLATES_DIR, name);
    const source = fs.readFileSync(filePath, 'utf-8');
    fn = Handlebars.compile(source);
    cache.set(name, fn);
  }
  return fn(data);
}
