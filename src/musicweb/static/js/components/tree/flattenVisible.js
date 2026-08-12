/**
 * Pure flatten of expanded tree into visible rows (render + keyboard).
 */

/**
 * @typedef {object} VisibleNode
 * @property {object} node
 * @property {string} key
 * @property {number} depth
 * @property {boolean} isLeaf
 * @property {string|null} parentKey
 * @property {number} index among visible
 */

/**
 * @param {object[]} roots
 * @param {(key: string) => boolean} isExpanded
 * @param {(key: string) => object[]} getChildren
 * @param {(node: object) => string} keyOf
 * @param {(node: object) => boolean} isLeafOf
 * @returns {VisibleNode[]}
 */
export function flattenVisible(
  roots,
  isExpanded,
  getChildren,
  keyOf,
  isLeafOf
) {
  /** @type {VisibleNode[]} */
  const out = [];

  /**
   * @param {object[]} nodes
   * @param {number} depth
   * @param {string|null} parentKey
   */
  function walk(nodes, depth, parentKey) {
    for (const node of nodes || []) {
      const key = keyOf(node);
      const isLeaf = isLeafOf(node);
      out.push({
        node,
        key,
        depth,
        isLeaf,
        parentKey,
        index: out.length,
      });
      if (!isLeaf && isExpanded(key)) {
        walk(getChildren(key), depth + 1, key);
      }
    }
  }

  walk(roots, 0, null);
  return out;
}
