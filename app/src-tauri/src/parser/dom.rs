use crate::runtime::AppState;

use std::collections::HashMap;

use serde::Serialize;

use crate::parser::{
    types::{DomId, NodeId}
};

struct Dom {
    nodes: Vec<Node>,
    root: NodeId,
}

#[derive(Debug)]
pub struct Node {
    pub parent: Option<NodeId>,
    pub children: Vec<NodeId>,
    pub kind: NodeKind,
}

#[derive(Debug)]
pub enum NodeKind {
    Document,
    Element {
        name: String,
        attrs: HashMap<String, String>,
    },
    Text(String),
}

enum Axis {
    Child,      // /
    Descendant, // //
}

struct Step {
    axis: Axis,
    test: NodeTest,
    predicate: Option<Predicate>,
}

enum NodeTest {
    Name(String), // tag
    Any,          // *
}

enum Predicate {
    HasAttr(String),
    AttrEquals { name: String, value: String },
}

fn eval_step(dom: &Dom, input: &[NodeId], step: &Step) -> Vec<NodeId> {
    let mut result = Vec::new();

    for &node_id in input {
        let candidates = match step.axis {
            Axis::Child => dom.nodes[node_id].children.clone(),
            Axis::Descendant => collect_descendants(dom, node_id),
        };

        for cid in candidates {
            if matches(dom, cid, &step.test, &step.predicate) {
                result.push(cid);
            }
        }
    }

    result
}

fn matches(dom: &Dom, node_id: NodeId, test: &NodeTest, pred: &Option<Predicate>) -> bool {
    let node = &dom.nodes[node_id];

    // Element 以外は対象外
    let (name, attrs) = match &node.kind {
        NodeKind::Element { name, attrs } => (name, attrs),
        _ => return false,
    };

    // tag / *
    match test {
        NodeTest::Any => {}
        NodeTest::Name(n) if n != name => return false,
        _ => {}
    }

    // predicate
    if let Some(p) = pred {
        match p {
            Predicate::HasAttr(a) => {
                if !attrs.contains_key(a) {
                    return false;
                }
            }
            Predicate::AttrEquals { name, value } => {
                if attrs.get(name) != Some(value) {
                    return false;
                }
            }
        }
    }

    true
}

fn collect_descendants(dom: &Dom, node_id: NodeId) -> Vec<NodeId> {
    let mut result = Vec::new();
    let mut stack = vec![node_id];

    while let Some(n) = stack.pop() {
        for &c in &dom.nodes[n].children {
            result.push(c);
            stack.push(c);
        }
    }

    result
}
#[derive(Debug)]
pub struct DomDocument {
    pub nodes: Vec<Node>,
}

#[derive(Serialize)]
pub struct DomParseResult {
    pub dom_id: DomId,
    pub node_count: usize,
}

pub struct DomStore {
    pub next_id: u64,
    pub doms: HashMap<u64, DomDocument>,
}
impl DomStore {
    pub fn new() -> Self {
        Self {
            next_id: 1,
            doms: HashMap::new(),
        }
    }
    pub fn info(&self, dom_id: u64) -> (u64, usize) {
        let doc = self.doms.get(&dom_id).expect("dom not found");
        (dom_id, doc.nodes.len())
    }

    pub fn parse(&mut self, source: String) -> u64 {
        let dom_id = self.next_id;
        self.next_id += 1;

        let _ = source;

        // 0番 = Document ノード（ルート）
        let root = Node {
            parent: None,
            children: Vec::new(),
            kind: NodeKind::Document,
        };

        let doc = DomDocument { nodes: vec![root] };

        self.doms.insert(dom_id, doc);
        dom_id
    }

    pub fn query(&self, dom_id: u64, _xpath: String) -> Vec<NodeId> {
        let doc = self.doms.get(&dom_id).expect("dom not found");

        // 仮実装：ルート(Document)を返す
        vec![0]
    }
    // fn find_by_tag(doc: &DomDocument, tag: &str) -> Vec<NodeId> {
    //     doc.nodes
    //         .iter()
    //         .enumerate()
    //         .filter_map(|(id, node)| match &node.kind {
    //             NodeKind::Element { name } if name == tag => Some(id),
    //             _ => None,
    //         })
    //         .collect()
    // }

    pub fn next_id(&mut self) -> DomId {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    pub fn insert(&mut self, id: DomId, dom: DomDocument) {
        self.doms.insert(id, dom);
    }

    pub fn remove(&mut self, id: DomId) {
        self.doms.remove(&id);
    }
}

#[tauri::command]
pub fn dom_parse(
    state: tauri::State<AppState>,
    worker_id: String,
    source: String,
) -> Result<DomId, String> {
    let mut workers = state.workers.lock().unwrap();

    let worker = workers
        .get_mut(&worker_id)
        .ok_or("worker not initialized")?;

    let dom_id = worker.dom_store.parse(source);
    Ok(dom_id)
}

#[tauri::command]
pub fn dom_query(
    state: tauri::State<AppState>,
    worker_id: String,
    dom_id: u64,
    xpath: String,
) -> Vec<NodeId> {
    let workers = state.workers.lock().unwrap();
    let ctx = workers.get(&worker_id).expect("worker not initialized");

    ctx.dom_store.query(dom_id, xpath)
}

#[tauri::command]
pub fn dom_info(state: tauri::State<AppState>, worker_id: String, dom_id: u64) -> (u64, usize) {
    let workers = state.workers.lock().unwrap();
    let ctx = workers.get(&worker_id).expect("worker not found");

    ctx.dom_store.info(dom_id)
}

#[tauri::command]
pub fn dom_debug(
    state: tauri::State<AppState>,
    worker_id: String,
    dom_id: DomId,
) -> Result<usize, String> {
    let workers = state.workers.lock().unwrap();
    let worker = workers.get(&worker_id).ok_or("worker not found")?;
    let dom = worker.dom_store.doms.get(&dom_id).ok_or("dom not found")?;
    Ok(dom.nodes.len())
}

#[tauri::command]
pub fn dom_dispose(
    state: tauri::State<AppState>,
    worker_id: String,
    dom_id: DomId,
) -> Result<(), String> {
    let mut workers = state.workers.lock().unwrap();

    let worker = workers
        .get_mut(&worker_id)
        .ok_or("worker not initialized")?;

    match worker.dom_store.doms.remove(&dom_id) {
        Some(_) => Ok(()),
        None => Err(format!("dom not found: {}", dom_id)),
    }
}
