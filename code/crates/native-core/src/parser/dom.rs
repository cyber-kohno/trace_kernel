use crate::parser::types::{DomId, NodeId};
use crate::resource_limits::{
    DOM_MAX_DEPTH, DOM_MAX_DOCUMENTS, DOM_MAX_NODES, DOM_QUERY_MAX_VISITS, DOM_SOURCE_MAX_BYTES,
    DOM_TEXT_MAX_BYTES, DOM_XPATH_MAX_BYTES, DOM_XPATH_MAX_STEPS,
};
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
    total_nodes: usize,
}

impl Default for DomStore {
    fn default() -> Self {
        Self::new()
    }
}

impl DomStore {
    pub fn clear(&mut self) {
        self.doms.clear();
        self.total_nodes = 0;
    }
    pub fn new() -> Self {
        Self {
            next_id: 1,
            doms: HashMap::new(),
            total_nodes: 0,
        }
    }

    pub fn info(&self, dom_id: DomId) -> Result<(DomId, usize), String> {
        let doc = self.doms.get(&dom_id).ok_or("dom not found")?;
        Ok((dom_id, doc.nodes.len()))
    }

    pub fn parse(&mut self, source: String) -> Result<DomId, String> {
        self.check_source(&source)?;
        let xml = XmlDocument::parse(&source).map_err(|e| e.to_string())?;

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
            append_xml_node(
                &mut doc,
                child,
                root_id,
                1,
                DOM_MAX_NODES - self.total_nodes,
            )?;
        }

        doc.root_element = doc.nodes[doc.root]
            .children
            .iter()
            .copied()
            .find(|id| matches!(doc.nodes[*id].kind, NodeKind::Element { .. }));

        self.insert_document(doc)
    }

    pub fn parse_html(&mut self, source: String) -> Result<DomId, String> {
        self.check_source(&source)?;
        let html = ScraperHtml::parse_document(&source);

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
            append_html_node(
                &mut doc,
                child,
                root_id,
                1,
                DOM_MAX_NODES - self.total_nodes,
            )?;
        }

        doc.root_element = doc.nodes[doc.root]
            .children
            .iter()
            .copied()
            .find(|id| matches!(doc.nodes[*id].kind, NodeKind::Element { .. }));

        self.insert_document(doc)
    }

    fn check_source(&self, source: &str) -> Result<(), String> {
        if source.len() > DOM_SOURCE_MAX_BYTES {
            return Err(format!("DOM source exceeds {DOM_SOURCE_MAX_BYTES} bytes"));
        }
        if self.doms.len() >= DOM_MAX_DOCUMENTS {
            return Err(format!("DOM document count exceeds {DOM_MAX_DOCUMENTS}"));
        }
        if self.total_nodes >= DOM_MAX_NODES {
            return Err(format!("DOM node count exceeds {DOM_MAX_NODES}"));
        }
        Ok(())
    }

    fn insert_document(&mut self, doc: DomDocument) -> Result<DomId, String> {
        self.total_nodes += doc.nodes.len();
        let dom_id = self.next_id;
        self.next_id += 1;
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
        validate_node_id(doc, start)?;
        let mut current = vec![start];
        let mut visits = 0;

        for step in &steps {
            current = eval_step(doc, &current, step, &mut visits)?;
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
        collect_text(doc, node_id)
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
        if let Some(doc) = self.doms.remove(&id) {
            self.total_nodes -= doc.nodes.len();
        }
    }
}

fn validate_node_id(doc: &DomDocument, node_id: NodeId) -> Result<(), String> {
    if node_id >= doc.nodes.len() {
        return Err(format!("node not found: {}", node_id));
    }
    Ok(())
}

fn check_node_budget(doc: &DomDocument, depth: usize, max_nodes: usize) -> Result<(), String> {
    if depth > DOM_MAX_DEPTH {
        return Err(format!("DOM depth exceeds {DOM_MAX_DEPTH}"));
    }
    if doc.nodes.len() >= max_nodes {
        return Err(format!("DOM node count exceeds {DOM_MAX_NODES}"));
    }
    Ok(())
}

fn append_xml_node(
    doc: &mut DomDocument,
    xml_node: XmlNode<'_, '_>,
    parent_id: NodeId,
    depth: usize,
    max_nodes: usize,
) -> Result<(), String> {
    match xml_node.node_type() {
        NodeType::Element => {
            check_node_budget(doc, depth, max_nodes)?;
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
                append_xml_node(doc, child, node_id, depth + 1, max_nodes)?;
            }
        }
        NodeType::Text => {
            if let Some(text) = xml_node.text() {
                check_node_budget(doc, depth, max_nodes)?;
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
    Ok(())
}

fn append_html_node(
    doc: &mut DomDocument,
    html_node: ego_tree::NodeRef<'_, ScraperNode>,
    parent_id: NodeId,
    depth: usize,
    max_nodes: usize,
) -> Result<(), String> {
    match html_node.value() {
        ScraperNode::Element(element) => {
            check_node_budget(doc, depth, max_nodes)?;
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
                append_html_node(doc, child, node_id, depth + 1, max_nodes)?;
            }
        }
        ScraperNode::Text(text) => {
            check_node_budget(doc, depth, max_nodes)?;
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
                append_html_node(doc, child, parent_id, depth, max_nodes)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn collect_text(doc: &DomDocument, node_id: NodeId) -> Result<String, String> {
    let mut result = String::new();
    let mut stack = vec![node_id];
    while let Some(id) = stack.pop() {
        match &doc.nodes[id].kind {
            NodeKind::Text(text) => {
                if text.len() > DOM_TEXT_MAX_BYTES.saturating_sub(result.len()) {
                    return Err(format!("DOM text exceeds {DOM_TEXT_MAX_BYTES} bytes"));
                }
                result.push_str(text);
            }
            _ => stack.extend(doc.nodes[id].children.iter().rev().copied()),
        }
    }
    Ok(result)
}

fn eval_step(
    dom: &DomDocument,
    input: &[NodeId],
    step: &Step,
    visits: &mut usize,
) -> Result<Vec<NodeId>, String> {
    let mut result = Vec::new();

    for &node_id in input {
        let candidates = match step.axis {
            Axis::Child => dom.nodes[node_id].children.clone(),
            Axis::Descendant => collect_descendants(dom, node_id),
        };

        *visits = (*visits).saturating_add(candidates.len());
        if *visits > DOM_QUERY_MAX_VISITS {
            return Err(format!(
                "DOM query exceeds {DOM_QUERY_MAX_VISITS} node visits"
            ));
        }

        for cid in candidates {
            if matches(dom, cid, &step.test, &step.predicate) {
                if result.len() >= DOM_MAX_NODES {
                    return Err(format!("DOM query result exceeds {DOM_MAX_NODES} nodes"));
                }
                result.push(cid);
            }
        }
    }

    Ok(result)
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
    if xpath.len() > DOM_XPATH_MAX_BYTES {
        return Err(format!("DOM XPath exceeds {DOM_XPATH_MAX_BYTES} bytes"));
    }
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
        if steps.len() > DOM_XPATH_MAX_STEPS {
            return Err(format!("DOM XPath exceeds {DOM_XPATH_MAX_STEPS} steps"));
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_and_node_limits_reject_without_storing_a_partial_document() {
        let mut store = DomStore::new();
        assert!(store
            .parse("x".repeat(DOM_SOURCE_MAX_BYTES + 1))
            .unwrap_err()
            .contains("source"));
        assert!(store.doms.is_empty());
        store.total_nodes = DOM_MAX_NODES - 2;
        assert!(store
            .parse("<root><child/></root>".into())
            .unwrap_err()
            .contains("node count"));
        assert!(store.doms.is_empty());
        assert_eq!(store.next_id, 1);
        store.total_nodes = 0;
        let id = store.parse("<root><child/></root>".into()).unwrap();
        assert_eq!(store.total_nodes, 3);
        store.remove(id);
        assert_eq!(store.total_nodes, 0);
        let ids = (0..DOM_MAX_DOCUMENTS)
            .map(|_| store.parse("<x/>".into()).unwrap())
            .collect::<Vec<_>>();
        assert!(store
            .parse("<x/>".into())
            .unwrap_err()
            .contains("document count"));
        store.remove(ids[0]);
        store.parse("<x/>".into()).unwrap();
    }

    #[test]
    fn depth_limit_rejects_xml_and_html_without_retaining_partial_data() {
        let mut store = DomStore::new();
        let xml = format!(
            "{}{}",
            "<a>".repeat(DOM_MAX_DEPTH + 1),
            "</a>".repeat(DOM_MAX_DEPTH + 1)
        );
        assert!(store.parse(xml).unwrap_err().contains("depth"));
        let html = format!(
            "{}{}",
            "<div>".repeat(DOM_MAX_DEPTH + 1),
            "</div>".repeat(DOM_MAX_DEPTH + 1)
        );
        assert!(store.parse_html(html).unwrap_err().contains("depth"));
        assert!(store.doms.is_empty());
    }

    #[test]
    fn xpath_and_text_limits_reject_before_returning_partial_results() {
        let mut store = DomStore::new();
        let id = store
            .parse("<root><a>one</a><a>two</a></root>".into())
            .unwrap();
        assert!(store
            .query(id, None, format!("/{}", "x".repeat(DOM_XPATH_MAX_BYTES)))
            .unwrap_err()
            .contains("XPath"));
        assert!(store
            .query(id, None, "/a".repeat(DOM_XPATH_MAX_STEPS + 1))
            .unwrap_err()
            .contains("steps"));
        assert_eq!(store.query(id, None, "//a".into()).unwrap().len(), 2);
        let doc = DomDocument {
            nodes: vec![Node {
                parent: None,
                children: Vec::new(),
                kind: NodeKind::Text("x".repeat(DOM_TEXT_MAX_BYTES + 1)),
            }],
            root: 0,
            root_element: None,
        };
        assert!(collect_text(&doc, 0).unwrap_err().contains("text"));
    }
}
