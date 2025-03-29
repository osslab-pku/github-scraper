// Wraps CloudFlare HTMLRewriter API
// ref: https://github.com/edmundhung/remix-guide/blob/new-design/worker/store/preview.ts

type KeyType = string | number
type TransformFunc = (element: Element, key: KeyType) => KeyType

export class HTMLParser {
  rewriter = new HTMLRewriter()
  // global states
  key = '$keyIsNull' as KeyType
  res = {}

  /**
   * Transforms globalState on element
   * @param selector CSS Selector
   * @param transform_fn like (element, key) => key + 1
   * @returns {void}
   */
  addKeyParser(selector: string, transform_fn: TransformFunc): void {
    const parser = this
    this.rewriter.on(selector, {
      element(element) {
        // console.log(parser.key)
        parser.key = transform_fn(element, parser.key)
      },
    })
  }

  /**
   * Parse an element attribute
   * @param name entry name
   * @param selector CSS Selector
   * @param attribute element attribute
   * @param overrideKey set value on res[overrideKey][name]
   * @returns Object<String, Array> {'1': ['labels', '1']}
   */
  addAttributeParser(
    name: string,
    selector: string,
    attribute: string,
    overrideKey?: string,
  ): void {
    const parser = this
    this.rewriter.on(selector, {
      element(element) {
        const key = overrideKey ? overrideKey : parser.key
        key in parser.res || (parser.res[key] = {})
        name in parser.res[key] || (parser.res[key][name] = [])
        parser.res[key][name].push(
          decodeURIComponent(element.getAttribute(attribute)),
        )
      },
    })
  }

  /**
   * Parse Texts for an element
   * @param name entry name
   * @param selector CSS Selector
   * @param overrideKey set value on res[overrideKey][name]
   * @returns Object<String, Array> {'1': ['labels', '1']}
   */
  addTextParser(name: string, selector: string, overrideKey?: string): void {
    const parser = this
    let text = ''
    this.rewriter.on(selector, {
      element(element) {
        text = ''
      },
      text(element) {
        text = (text ? text : '') + element.text
        if (element.lastInTextNode) {
          const key = overrideKey ? overrideKey : parser.key
          key in parser.res || (parser.res[key] = {})
          name in parser.res[key] || (parser.res[key][name] = [])
          parser.res[key][name].push(decode(text))
          text = ''
        }
      },
    })
  }

  /**
   * Append to field base on the existence of selectors
   * @param name entry name
   * @param config {".js-issue-row": "issue"} (got a .js-issue-row, push a issue)
   * @param overrideKey set value on res[overrideKey][name]
   */
  addCaseParser(
    name: string,
    config: Record<string, any>,
    overrideKey?: string,
  ): void {
    const parser = this
    Object.entries(config).forEach(([selector, value]) => {
      this.rewriter.on(selector, {
        element(element) {
          const key = overrideKey ? overrideKey : parser.key
          key in parser.res || (parser.res[key] = {})
          name in parser.res[key] || (parser.res[key][name] = [])
          parser.res[key][name].push(value)
        },
      })
    })
  }

  /**
   * await response to finish
   * @param response
   * @returns res
   */
  async parse(response: Response) {
    await this.rewriter.transform(response).arrayBuffer()
    const res = this.res
    // reset global states
    this.key = '$keyIsNull'
    this.res = {}
    return res
  }
}

export const objectMap = (
  obj: Record<string, any>,
  fn: (v: any, k?: any, i?: number) => any,
) =>
  Object.fromEntries(Object.entries(obj).map(([k, v], i) => [k, fn(v, k, i)]))

export const fieldMap = (
  obj: Record<string, any>,
  name: string,
  fn: (v: any, k?: any, i?: number) => any,
) =>
  objectMap(obj, (item, key) =>
    objectMap(item, (v, k) => (k === name ? fn(v, key) : v)),
  )

export const zip = (keys: Array<any>, values: Array<any>): Object =>
  Object.assign.apply(
    {},
    keys.map((v, i) => ({ [v]: values[i] })),
  )
