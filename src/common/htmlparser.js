// Wraps CloudFlare HTMLRewriter API
// ref: https://github.com/edmundhung/remix-guide/blob/new-design/worker/store/preview.ts

import { decode } from 'html-entities';

export class HTMLParser {
  rewriter = new HTMLRewriter();
  // global states
  key = "$keyIsNull";
  res = {};

  /**
   * Transforms globalState on element
   * @param selector CSS Selector
   * @param transform_fn like (element, key) => key + 1
   * @returns {{getResult(): null, setup(*): *}|null|void|*|HTMLRewriter}
   */
  addKeyParser(selector, transform_fn){
    const parser = this;
    this.rewriter.on(selector, {
      element(element) {
        // console.log(parser.key)
        parser.key = transform_fn(element, parser.key);
      },
    });
  }

  /**
   * Parse an element attribute
   * @param name entry name
   * @param selector CSS Selector
   * @param attribute element attribute
   * @param overrideKey set value on res[overrideKey][name]
   * @returns Object<String, Array> {'1': ['labels', '1']}
   */
  addAttributeParser(name, selector, attribute, overrideKey=null) {
    const parser = this;
    this.rewriter.on(selector, {
      element(element) {
        const key = overrideKey ? overrideKey: parser.key;
        (key in parser.res) || (parser.res[key] = {});
        (name in parser.res[key]) || (parser.res[key][name] = []);
        parser.res[key][name].push(decode(element.getAttribute(attribute)));
      },
    });
  }

  /**
   * Parse Texts for an element
   * @param name entry name
   * @param selector CSS Selector
   * @param overrideKey set value on res[overrideKey][name]
   * @returns Object<String, Array> {'1': ['labels', '1']}
   */
  addTextParser(name, selector, overrideKey=null) {
    const parser = this;
    let text = '';
    this.rewriter.on(selector, {
      element(element) {
        text = '';
      },
      text(element) {
        text = (text? text: '' ) + element.text;
        if (element.lastInTextNode) {
          const key = overrideKey ? overrideKey: parser.key;
          (key in parser.res) || (parser.res[key] = {});
          (name in parser.res[key]) || (parser.res[key][name] = []);
          parser.res[key][name].push(decode(text));
          text = '';
        }
      }
    });
  }

  /**
   * Append to field base on the existence of selectors
   * @param name entry name
   * @param config {".js-issue-row": "issue"} (got a .js-issue-row, push a issue)
   * @param overrideKey set value on res[overrideKey][name]
   */
  addCaseParser(name, config, overrideKey=null){
    const parser = this;
    Object.entries(config).forEach(([selector, value]) => {
      this.rewriter.on(selector, {
        element(element) {
          const key = overrideKey ? overrideKey: parser.key;
          (key in parser.res) || (parser.res[key] = {});
          (name in parser.res[key]) || (parser.res[key][name] = []);
          parser.res[key][name].push(value);
        },
      });
    });
  }

  /**
   * await response to finish
   * @param response
   * @returns res
   */
  async parse(response){
    await this.rewriter.transform(response).arrayBuffer();
    const res = this.res;
    // reset global states
    this.key = "$keyIsNull";
    this.res = {};
    return res;
  }
}

export const objectMap = (obj, fn) =>
  Object.fromEntries(
    Object.entries(obj).map(
      ([k, v], i) => [k, fn(v, k, i)]
    )
  )

export const fieldMap = (obj, name, fn) =>
  objectMap(obj, (item, key) =>
    objectMap(item, (v, k) => k === name? fn(v, key): v)
  )

export const zip = (keys, values) =>
  Object.assign.apply({}, keys.map( (v, i) => ( {[v]: values[i]} ) ) )

