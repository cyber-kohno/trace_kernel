import type StoreDataset from "../../../../store/storeDataset";


namespace ChooseUtil {
  export const getDispRecords = (
    root: StoreDataset.UsableNode,
    isFlat: boolean,
  ): StoreDataset.NodeDispProps[] => {
    return !isFlat ? buildTreeChooser(root) : buildFlatChooser(root);
  };

  /**
   * ツリー表示
   * @param root 
   * @returns 
   */
  const buildTreeChooser = (root: StoreDataset.UsableNode): StoreDataset.NodeDispProps[] => {
    const masterList: StoreDataset.NodeDispProps[] = [];
    const rec = (
      node: StoreDataset.UsableNode,
      indents: StoreDataset.NodeIndent[],
      isOpen: boolean,
    ): [number, number] => {
      let [fileCnt, selectCnt] = [0, 0];

      // 子要素追加前のレコード数を控える
      const curCount = masterList.length;

      if (node.child != undefined) {
        const child = node.child;
        [child.fileCnt, child.selectCnt] = [0, 0];
        const nodes = node.child.nodes;
        nodes.forEach((n, i) => {
          const nextIndents: StoreDataset.NodeIndent[] = indents.slice();
          // 自身がlastの場合、子要素はnoneにする
          if (nextIndents[nextIndents.length - 1] === "last")
            nextIndents[nextIndents.length - 1] = "none";
          nextIndents.push(
            (() => {
              if (i === nodes.length - 1) return "last";
              else return "middle";
            })(),
          );
          const [cFileCnt, cSelectCnt] = rec(
            n,
            nextIndents,
            isOpen && child.isOpen,
          );
          child.fileCnt += cFileCnt;
          child.selectCnt += cSelectCnt;
        });
        fileCnt += child.fileCnt;
        selectCnt += child.selectCnt;
      } else {
        fileCnt++;
        selectCnt += node.isSelected ? 1 : 0;
      }
      if (isOpen && fileCnt > 0) {
        masterList.splice(curCount, 0, {
          indents,
          node,
          seq: curCount,
        });

        // 以降の seq を +1 する
        for (let i = curCount + 1; i < masterList.length; i++) {
          masterList[i].seq = i;
        }
      }
      return [fileCnt, selectCnt];
    };
    rec(root, [], true);

    return masterList;
  };

  /**
   * フラット表示
   * @param root 
   * @returns 
   */
  const buildFlatChooser = (root: StoreDataset.UsableNode) => {
    const list: StoreDataset.NodeDispProps[] = [];

    const rec = (node: StoreDataset.UsableNode) => {
      if (node.child == undefined) {
        list.push({
          indents: [],
          node,
          seq: list.length,
        });
      } else {
        node.child.nodes.forEach((n) => rec(n));
      }
    };
    if (root.child == undefined) throw new Error();

    root.child.nodes.forEach((n) => rec(n));
    return list;
  };

  export const getSelectedFiles = (root: StoreDataset.UsableNode) => {
    const list: string[] = [];

    const rec = (node: StoreDataset.UsableNode) => {
      if (node.child == undefined) {
        // 選択中のアイテムのみ追加
        if (node.isSelected) {
          list.push(node.path.replace(root.path, ''));
        }
      } else {
        node.child.nodes.forEach((n) => rec(n));
      }
    };
    if (root.child == undefined) throw new Error();

    root.child.nodes.forEach((n) => rec(n));
    return list;
  };
}
export default ChooseUtil;
