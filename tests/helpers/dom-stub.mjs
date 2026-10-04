/**
 * یک DOM بسیار کوچک برای اجرای src/main.js در محیط Node.
 * هدف: کشف خطاهای اتصال (selectorهای اشتباه، المان‌های گم‌شده) بدون اضافه‌کردن
 * dependency مرورگر یا فریم‌ورک تست. فقط قابلیت‌هایی پیاده‌سازی شده‌اند که
 * main.js واقعاً استفاده می‌کند.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr", "path", "circle", "polyline", "line", "rect", "use", "stop",
]);

class ClassList {
  constructor(element) {
    this.element = element;
  }

  get tokens() {
    return this.element._class.split(/\s+/).filter(Boolean);
  }

  add(...names) {
    const set = new Set(this.tokens);
    for (const name of names) if (name) set.add(name);
    this.element._class = [...set].join(" ");
  }

  remove(...names) {
    const set = new Set(this.tokens);
    for (const name of names) set.delete(name);
    this.element._class = [...set].join(" ");
  }

  contains(name) {
    return this.tokens.includes(name);
  }

  toggle(name, force) {
    const next = force === undefined ? !this.contains(name) : Boolean(force);
    if (next) this.add(name);
    else this.remove(name);
    return next;
  }
}

function kebab(key) {
  return String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

class ElementStub {
  constructor(tagName, doc) {
    this.tagName = String(tagName).toUpperCase();
    this.document = doc;
    this.children = [];
    this.parent = null;
    this.attributes = new Map();
    this.style = {};
    this.listeners = new Map();
    this.hidden = false;
    this.value = "";
    this.disabled = false;
    this._class = "";
    this._text = "";
    const self = this;
    this.dataset = new Proxy(
      {},
      {
        set(target, key, next) {
          target[key] = next;
          self.attributes.set(`data-${kebab(key)}`, String(next));
          return true;
        },
      },
    );
  }

  get className() {
    return this._class;
  }

  set className(value) {
    this._class = String(value ?? "");
  }

  get classList() {
    return new ClassList(this);
  }

  get id() {
    return this.attributes.get("id") ?? "";
  }

  set id(value) {
    this.setAttribute("id", value);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "id") this.document._index.set(String(value), this);
    if (name === "hidden") this.hidden = true;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  append(...nodes) {
    for (const node of nodes) {
      if (!node) continue;
      if (node.tagName === "#FRAGMENT") {
        this.append(...node.children);
        continue;
      }
      node.parent = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this._text = "";
    this.append(...nodes);
  }

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }

  get textContent() {
    if (this.children.length) return this.children.map((child) => child.textContent).join("");
    return this._text;
  }

  set textContent(value) {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this._text = String(value ?? "");
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) ?? []) handler({ ...event, type });
  }

  matches(selector) {
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    const attribute = selector.match(/^\[([\w-]+)(?:[~^$*|]?=(?:"|')?([^"'\]]*)(?:"|')?)?\]$/);
    if (attribute) {
      if (!this.attributes.has(attribute[1])) return false;
      return attribute[2] === undefined || this.attributes.get(attribute[1]) === attribute[2];
    }
    return this.tagName === selector.toUpperCase();
  }

  descendants() {
    const found = [];
    const walk = (node) => {
      for (const child of node.children) {
        found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }

  querySelectorAll(selector) {
    return this.descendants().filter((element) => element.matches(selector));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parent;
    }
    return null;
  }

  focus() {}

  scrollIntoView() {}

  select() {}

  click() {
    this.dispatch("click", { target: this });
  }
}

class DocumentStub {
  constructor(html) {
    this._index = new Map();
    this.root = new ElementStub("#fragment", this);
    this.documentElement = new ElementStub("html", this);
    this.root.append(this.documentElement);
    this.body = new ElementStub("body", this);
    this.documentElement.append(this.body);
    this.buildFromHtml(html);
  }

  createElement(tagName) {
    return new ElementStub(tagName, this);
  }

  createElementNS(_namespace, tagName) {
    return new ElementStub(tagName, this);
  }

  createDocumentFragment() {
    return new ElementStub("#fragment", this);
  }

  getElementById(id) {
    return this._index.get(id) ?? null;
  }

  querySelector(selector) {
    if (selector.startsWith("#")) return this.getElementById(selector.slice(1));
    return this.root.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.root.querySelectorAll(selector);
  }

  addEventListener() {}

  buildFromHtml(html) {
    const markup = String(html).replace(/<!doctype[^>]*>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
    const tokenPattern = /<(\/?)([a-zA-Z][\w-]*)\b([^>]*?)(\/?)>/g;
    const stack = [this.body];
    for (const [, closing, tagName, rawAttributes, selfClosing] of markup.matchAll(tokenPattern)) {
      if (closing) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const element = this.createElement(tagName);
      for (const [, name, value] of String(rawAttributes).matchAll(/([\w:.-]+)(?:="([^"]*)")?/g)) {
        if (!name) continue;
        element.setAttribute(name, value ?? "");
      }
      stack[stack.length - 1].append(element);
      if (!VOID_TAGS.has(tagName.toLowerCase()) && !selfClosing) stack.push(element);
    }
  }
}

class StorageStub {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }
}

/** ساخت document/window ساختگی و نصب آن‌ها روی globalThis. */
export async function createDomEnvironment() {
  const html = await readFile(path.join(projectRoot, "index.html"), "utf8");
  const document = new DocumentStub(html);
  const storage = new StorageStub();
  const window = {
    document,
    localStorage: storage,
    scrollY: 0,
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    matchMedia: (query) => ({ matches: query.includes("prefers-reduced-motion") }),
    addEventListener() {},
    print() {},
    confirm: () => true,
  };
  globalThis.Element = ElementStub;
  globalThis.window = window;
  globalThis.document = document;
  globalThis.localStorage = storage;
  globalThis.location = { protocol: "https:", hostname: "example.test", href: "https://example.test/" };
  return { document, window, storage, html };
}

export function releaseDomEnvironment() {
  delete globalThis.Element;
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.localStorage;
  delete globalThis.location;
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function persianToNumber(value) {
  const text = String(value).replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)));
  const match = text.match(/-?\d+/);
  return match ? Number(match[0]) : Number.NaN;
}
