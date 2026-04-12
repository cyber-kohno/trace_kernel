use crate::parser::types::{DomId, NodeId};
use crate::runtime::AppState;
use roxmltree::{Document as XmlDocument, Node as XmlNode, NodeType};
use scraper::node::Node as ScraperNode;
use scraper::Html as ScraperHtml;
use std::collections::HashMap;

#[derive(Debug)]
pub struct DomDocument {
    pub nodes: Vec<Node>,
    pub root: NodeId,
    pub root_element: Option<NodeId>,
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

#[derive(Debug, Clone, Copy)]
enum Axis {
    Child,
    Descendant,
}

#[derive(Debug)]
struct Step {
    axis: Axis,
    test: NodeTest,
    predicate: Option<Predicate>,
}

#[derive(Debug)]
enum NodeTest {
    Name(String),
    Any,
}

#[derive(Debug)]
enum Predicate {
    HasAttr(String),
    AttrEquals { name: String, value: String },
}

pub struct DomStore {
    pub next_id: DomId,
    pub doms: HashMap<DomId, DomDocument>,
}

impl DomStore {
    pub fn new() -> Self {
        Self {
            next_id: 1,
            doms: HashMap::new(),
        }
    }

    pub fn info(&self, dom_id: DomId) -> Result<(DomId, usize), String> {
        let doc = self.doms.get(&dom_id).ok_or("dom not found")?;
        Ok((dom_id, doc.nodes.len()))
    }

    pub fn parse(&mut self, source: String) -> Result<DomId, String> {
        let xml = XmlDocument::parse(&source).map_err(|e| e.to_string())?;
        let dom_id = self.next_id;
        self.next_id += 1;

        let mut doc = DomDocument {
            nodes: vec![Node {
                parent: None,
                children: Vec::new(),
                kind: NodeKind::Document,
            }],
            root: 0,
            root_element: None,
        };

        let root_id = doc.root;
        for child in xml.root().children() {
            append_xml_node(&mut doc, child, root_id);
        }

        doc.root_element = doc.nodes[doc.root]
            .children
            .iter()
            .copied()
            .find(|id| matches!(doc.nodes[*id].kind, NodeKind::Element { .. }));

        self.doms.insert(dom_id, doc);
        Ok(dom_id)
    }

    pub fn parse_html(&mut self, source: String) -> Result<DomId, String> {
        let html = ScraperHtml::parse_document(&source);
        let dom_id = self.next_id;
        self.next_id += 1;

        let mut doc = DomDocument {
            nodes: vec![Node {
                parent: None,
                children: Vec::new(),
                kind: NodeKind::Document,
            }],
            root: 0,
            root_element: None,
        };

        let root_id = doc.root;
        let html_root = html.tree.root();
        for child in html_root.children() {
            append_html_node(&mut doc, child, root_id);
        }

        doc.root_element = doc.nodes[doc.root]
            .children
            .iter()
            .copied()
            .find(|id| matches!(doc.nodes[*id].kind, NodeKind::Element { .. }));

        self.doms.insert(dom_id, doc);
        Ok(dom_id)
    }

    pub fn root_element(&self, dom_id: DomId) -> Result<Option<NodeId>, String> {
        Ok(self.doms.get(&dom_id).ok_or("dom not found")?.root_element)
    }

    pub fn query(
        &self,
        dom_id: DomId,
        base_node_id: Option<NodeId>,
        xpath: String,
    ) -> Result<Vec<NodeId>, String> {
        let doc = self.doms.get(&dom_id).ok_or("dom not found")?;
        let steps = parse_xpath(&xpath, base_node_id.is_none())?;
        let start = base_node_id.unwrap_or(doc.root);
        let mut current = vec![start];

        for step in &steps {
            current = eval_step(doc, &current, step);
        }

        Ok(current)
    }

    pub fn node_name(&self, dom_id: DomId, node_id: NodeId) -> Result<Option<String>, String> {
        let node = self.get_node(dom_id, node_id)?;
        let name = match &node.kind {
            NodeKind::Element { name, .. } => Some(name.clone()),
            _ => None,
        };
        Ok(name)
    }

    pub fn node_text(&self, dom_id: DomId, node_id: NodeId) -> Result<String, String> {
        let doc = self.doms.get(&dom_id).ok_or("dom not found")?;
        validate_node_id(doc, node_id)?;
        Ok(collect_text(doc, node_id))
    }

    pub fn node_attr(
        &self,
        dom_id: DomId,
        node_id: NodeId,
        name: String,
    ) -> Result<Option<String>, String> {
        let node = self.get_node(dom_id, node_id)?;
        let value = match &node.kind {
            NodeKind::Element { attrs, .. } => attrs.get(&name).cloned(),
            _ => None,
        };
        Ok(value)
    }

    pub fn node_children(&self, dom_id: DomId, node_id: NodeId) -> Result<Vec<NodeId>, String> {
        let doc = self.doms.get(&dom_id).ok_or("dom not found")?;
        validate_node_id(doc, node_id)?;
        Ok(doc.nodes[node_id].children.clone())
    }

    pub fn node_parent(&self, dom_id: DomId, node_id: NodeId) -> Result<Option<NodeId>, String> {
        let doc = self.doms.get(&dom_id).ok_or("dom not found")?;
        validate_node_id(doc, node_id)?;
        Ok(doc.nodes[node_id].parent)
    }

    fn get_node(&self, dom_id: DomId, node_id: NodeId) -> Result<&Node, String> {
        let doc = self.doms.get(&dom_id).ok_or("dom not found")?;
        validate_node_id(doc, node_id)?;
        Ok(&doc.nodes[node_id])
    }

    pub fn remove(&mut self, id: DomId) {
        self.doms.remove(&id);
    }
}

fn validate_node_id(doc: &DomDocument, node_id: NodeId) -> Result<(), String> {
    if node_id >= doc.nodes.len() {
        return Err(format!("node not found: {}", node_id));
    }
    Ok(())
}

fn append_xml_node(doc: &mut DomDocument, xml_node: XmlNode<'_, '_>, parent_id: NodeId) {
    match xml_node.node_type() {
        NodeType::Element => {
            let node_id = doc.nodes.len();
            let attrs = xml_node
                .attributes()
                .map(|a| (a.name().to_string(), a.value().to_string()))
                .collect::<HashMap<_, _>>();

            doc.nodes.push(Node {
                parent: Some(parent_id),
                children: Vec::new(),
                kind: NodeKind::Element {
                    name: xml_node.tag_name().name().to_string(),
                    attrs,
                },
            });
            doc.nodes[parent_id].children.push(node_id);

            for child in xml_node.children() {
                append_xml_node(doc, child, node_id);
            }
        }
        NodeType::Text => {
            if let Some(text) = xml_node.text() {
                let node_id = doc.nodes.len();
                doc.nodes.push(Node {
                    parent: Some(parent_id),
                    children: Vec::new(),
                    kind: NodeKind::Text(text.to_string()),
                });
                doc.nodes[parent_id].children.push(node_id);
            }
        }
        _ => {}
    }
}

fn append_html_node(
    doc: &mut DomDocument,
    html_node: ego_tree::NodeRef<'_, ScraperNode>,
    parent_id: NodeId,
) {
    match html_node.value() {
        ScraperNode::Element(element) => {
            let node_id = doc.nodes.len();

            let attrs = element
                .attrs
                .iter()
                .map(|(k, v)| (k.local.to_string(), v.to_string()))
                .collect::<HashMap<_, _>>();

            doc.nodes.push(Node {
                parent: Some(parent_id),
                children: Vec::new(),
                kind: NodeKind::Element {
                    name: element.name.local.to_string(),
                    attrs,
                },
            });
            doc.nodes[parent_id].children.push(node_id);

            for child in html_node.children() {
                append_html_node(doc, child, node_id);
            }
        }
        ScraperNode::Text(text) => {
            let node_id = doc.nodes.len();
            doc.nodes.push(Node {
                parent: Some(parent_id),
                children: Vec::new(),
                kind: NodeKind::Text(text.to_string()),
            });
            doc.nodes[parent_id].children.push(node_id);
        }
        ScraperNode::Document => {
            for child in html_node.children() {
                append_html_node(doc, child, parent_id);
            }
        }
        _ => {}
    }
}

fn collect_text(doc: &DomDocument, node_id: NodeId) -> String {
    match &doc.nodes[node_id].kind {
        NodeKind::Text(text) => text.clone(),
        _ => {
            let mut acc = String::new();
            for &child in &doc.nodes[node_id].children {
                acc.push_str(&collect_text(doc, child));
            }
            acc
        }
    }
}

fn eval_step(dom: &DomDocument, input: &[NodeId], step: &Step) -> Vec<NodeId> {
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

fn matches(dom: &DomDocument, node_id: NodeId, test: &NodeTest, pred: &Option<Predicate>) -> bool {
    let node = &dom.nodes[node_id];

    let (name, attrs) = match &node.kind {
        NodeKind::Element { name, attrs } => (name, attrs),
        _ => return false,
    };

    match test {
        NodeTest::Any => {}
        NodeTest::Name(n) if n != name => return false,
        _ => {}
    }

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

fn collect_descendants(dom: &DomDocument, node_id: NodeId) -> Vec<NodeId> {
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

fn parse_xpath(xpath: &str, is_document_query: bool) -> Result<Vec<Step>, String> {
    let src = xpath.trim();
    if src.is_empty() {
        return Err("xpath must not be empty".into());
    }

    let bytes = src.as_bytes();
    let mut i = 0;
    let mut steps = Vec::new();

    while i < bytes.len() {
        let axis = if i + 1 < bytes.len() && bytes[i] == b'/' && bytes[i + 1] == b'/' {
            i += 2;
            Axis::Descendant
        } else if bytes[i] == b'/' {
            i += 1;
            Axis::Child
        } else if steps.is_empty() && !is_document_query {
            Axis::Child
        } else if steps.is_empty() && is_document_query {
            return Err("document queries must start with / or //".into());
        } else {
            return Err(format!("unexpected xpath token near: {}", &src[i..]));
        };

        let start = i;
        while i < bytes.len() && bytes[i] != b'/' && bytes[i] != b'[' {
            i += 1;
        }
        if start == i {
            return Err(format!("missing node test near: {}", &src[i..]));
        }

        let token = &src[start..i];
        let test = if token == "*" {
            NodeTest::Any
        } else {
            NodeTest::Name(token.to_string())
        };

        let predicate = if i < bytes.len() && bytes[i] == b'[' {
            let pred_start = i + 1;
            let pred_end = src[pred_start..]
                .find(']')
                .map(|idx| pred_start + idx)
                .ok_or("unterminated predicate")?;
            let pred_str = src[pred_start..pred_end].trim();
            i = pred_end + 1;
            Some(parse_predicate(pred_str)?)
        } else {
            None
        };

        steps.push(Step {
            axis,
            test,
            predicate,
        });
    }

    Ok(steps)
}

fn parse_predicate(src: &str) -> Result<Predicate, String> {
    let s = src.trim();
    if !s.starts_with('@') {
        return Err(format!("unsupported predicate: [{}]", src));
    }

    let body = &s[1..];
    if let Some(eq_pos) = body.find('=') {
        let name = body[..eq_pos].trim();
        let raw_value = body[eq_pos + 1..].trim();
        let value = unquote(raw_value)?;
        Ok(Predicate::AttrEquals {
            name: name.to_string(),
            value,
        })
    } else {
        Ok(Predicate::HasAttr(body.trim().to_string()))
    }
}

fn unquote(src: &str) -> Result<String, String> {
    let bytes = src.as_bytes();
    if bytes.len() >= 2
        && ((bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\''))
    {
        Ok(src[1..src.len() - 1].to_string())
    } else {
        Err(format!("attribute predicate value must be quoted: {}", src))
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
    worker.dom_store.parse(source)
}

#[tauri::command]
pub fn dom_parse_html(
    state: tauri::State<AppState>,
    worker_id: String,
    source: String,
) -> Result<DomId, String> {
    let mut workers = state.workers.lock().unwrap();
    let worker = workers
        .get_mut(&worker_id)
        .ok_or("worker not initialized")?;
    worker.dom_store.parse_html(source)
}

#[tauri::command]
pub fn dom_root(
    state: tauri::State<AppState>,
    worker_id: String,
    dom_id: DomId,
) -> Result<Option<NodeId>, String> {
    let workers = state.workers.lock().unwrap();
    let ctx = workers.get(&worker_id).ok_or("worker not initialized")?;
    ctx.dom_store.root_element(dom_id)
}

#[tauri::command]
pub fn dom_query(
    state: tauri::State<AppState>,
    worker_id: String,
    dom_id: DomId,
    xpath: String,
) -> Result<Vec<NodeId>, String> {
    let workers = state.workers.lock().unwrap();
    let ctx = workers.get(&worker_id).ok_or("worker not initialized")?;
    ctx.dom_store.query(dom_id, None, xpath)
}

#[tauri::command]
pub fn dom_query_from_node(
    state: tauri::State<AppState>,
    worker_id: String,
    dom_id: DomId,
    node_id: NodeId,
    xpath: String,
) -> Result<Vec<NodeId>, String> {
    let workers = state.workers.lock().unwrap();
    let ctx = workers.get(&worker_id).ok_or("worker not initialized")?;
    ctx.dom_store.query(dom_id, Some(node_id), xpath)
}

#[tauri::command]
pub fn dom_node_name(
    state: tauri::State<AppState>,
    worker_id: String,
    dom_id: DomId,
    node_id: NodeId,
) -> Result<Option<String>, String> {
    let workers = state.workers.lock().unwrap();
    let ctx = workers.get(&worker_id).ok_or("worker not initialized")?;
    ctx.dom_store.node_name(dom_id, node_id)
}

#[tauri::command]
pub fn dom_node_text(
    state: tauri::State<AppState>,
    worker_id: String,
    dom_id: DomId,
    node_id: NodeId,
) -> Result<String, String> {
    let workers = state.workers.lock().unwrap();
    let ctx = workers.get(&worker_id).ok_or("worker not initialized")?;
    ctx.dom_store.node_text(dom_id, node_id)
}

#[tauri::command]
pub fn dom_node_attr(
    state: tauri::State<AppState>,
    worker_id: String,
    dom_id: DomId,
    node_id: NodeId,
    name: String,
) -> Result<Option<String>, String> {
    let workers = state.workers.lock().unwrap();
    let ctx = workers.get(&worker_id).ok_or("worker not initialized")?;
    ctx.dom_store.node_attr(dom_id, node_id, name)
}

#[tauri::command]
pub fn dom_node_children(
    state: tauri::State<AppState>,
    worker_id: String,
    dom_id: DomId,
    node_id: NodeId,
) -> Result<Vec<NodeId>, String> {
    let workers = state.workers.lock().unwrap();
    let ctx = workers.get(&worker_id).ok_or("worker not initialized")?;
    ctx.dom_store.node_children(dom_id, node_id)
}

#[tauri::command]
pub fn dom_node_parent(
    state: tauri::State<AppState>,
    worker_id: String,
    dom_id: DomId,
    node_id: NodeId,
) -> Result<Option<NodeId>, String> {
    let workers = state.workers.lock().unwrap();
    let ctx = workers.get(&worker_id).ok_or("worker not initialized")?;
    ctx.dom_store.node_parent(dom_id, node_id)
}

#[tauri::command]
pub fn dom_info(
    state: tauri::State<AppState>,
    worker_id: String,
    dom_id: DomId,
) -> Result<(DomId, usize), String> {
    let workers = state.workers.lock().unwrap();
    let ctx = workers.get(&worker_id).ok_or("worker not found")?;
    ctx.dom_store.info(dom_id)
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

    if worker.dom_store.doms.contains_key(&dom_id) {
        worker.dom_store.remove(dom_id);
        Ok(())
    } else {
        Err(format!("dom not found: {}", dom_id))
    }
}
