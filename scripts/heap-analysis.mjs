// V8 snapshot analysis uses property signatures because production renames classes.
export function analyzeHeap(heap, baselineIds = new Set()) {
  const {
    node_fields: nf,
    edge_fields: ef,
    node_types: nt,
    edge_types: et,
  } = heap.snapshot.meta;
  const nw = nf.length,
    ew = ef.length;
  const ni = Object.fromEntries(nf.map((name, i) => [name, i]));
  const ei = Object.fromEntries(ef.map((name, i) => [name, i]));
  const count = heap.nodes.length / nw;
  const starts = new Uint32Array(count + 1);
  const ids = new Set();
  const groups = new Map();
  const totalsByType = {};
  const signatures = {
    simulation: ["randomState", "spawnClock", "input", "state", "config"],
    battleRenderer: [
      "ships",
      "balls",
      "explosions",
      "subtextures",
      "simulation",
    ],
    battleAudio: ["voices", "lastPlayed", "enabled"],
    pixiApplication: ["stage", "renderer", "_ticker"],
    pixiTicker: ["_head", "_requestId", "_protected", "lastTime"],
  };
  const resources = Object.fromEntries(
    Object.keys(signatures).map((key) => [key, []]),
  );
  const name = (index) => heap.strings[heap.nodes[index * nw + ni.name]];
  const type = (index) => nt[ni.type][heap.nodes[index * nw + ni.type]];
  const edgeName = (index) => {
    const kind = et[ei.type][heap.edges[index + ei.type]];
    const value = heap.edges[index + ei.name_or_index];
    return kind === "element" || kind === "hidden"
      ? String(value)
      : heap.strings[value];
  };
  for (let i = 0; i < count; i++) {
    const offset = i * nw;
    starts[i + 1] = starts[i] + heap.nodes[offset + ni.edge_count] * ew;
    const id = heap.nodes[offset + ni.id];
    ids.add(id);
    const key = `${type(i)}: ${name(i)}`;
    totalsByType[type(i)] ??= { count: 0, bytes: 0 };
    totalsByType[type(i)].count++;
    totalsByType[type(i)].bytes += heap.nodes[offset + ni.self_size];
    const group = groups.get(key) ?? {
      key,
      count: 0,
      bytes: 0,
      newCount: 0,
      newBytes: 0,
      examples: [],
    };
    group.count++;
    group.bytes += heap.nodes[offset + ni.self_size];
    if (!baselineIds.has(id)) {
      group.newCount++;
      group.newBytes += heap.nodes[offset + ni.self_size];
      if (group.examples.length < 2) group.examples.push(i);
    }
    groups.set(key, group);
    if (type(i) !== "object") continue;
    const properties = new Set();
    for (let e = starts[i]; e < starts[i + 1]; e += ew) {
      if (et[ei.type][heap.edges[e + ei.type]] === "property")
        properties.add(edgeName(e));
    }
    for (const [key, signature] of Object.entries(signatures)) {
      if (signature.every((property) => properties.has(property)))
        resources[key].push(i);
    }
  }
  // Shortest strong path is evidence of reachability, not a dominator/retained-size calculation.
  const parent = new Int32Array(count).fill(-1);
  const via = new Int32Array(count).fill(-1);
  const queue = new Uint32Array(count);
  let tail = 1;
  parent[0] = 0;
  for (let head = 0; head < tail; head++) {
    const from = queue[head];
    for (let e = starts[from]; e < starts[from + 1]; e += ew) {
      if (et[ei.type][heap.edges[e + ei.type]] === "weak") continue;
      const to = heap.edges[e + ei.to_node] / nw;
      if (parent[to] !== -1) continue;
      parent[to] = from;
      via[to] = e;
      queue[tail++] = to;
    }
  }
  const path = (index) => {
    const result = [];
    for (let at = index; at > 0 && result.length < 40; at = parent[at]) {
      if (parent[at] === -1) {
        result.push("No strong root path found");
        break;
      }
      result.push(`${edgeName(via[at])} -> ${type(at)}:${name(at)}`);
    }
    return result.reverse();
  };
  const summarize = (group) => ({
    ...group,
    examples: group.examples.map((index) => ({
      id: heap.nodes[index * nw + ni.id],
      path: path(index),
    })),
  });
  const propertyTarget = (index, property) => {
    for (let e = starts[index]; e < starts[index + 1]; e += ew) {
      if (
        et[ei.type][heap.edges[e + ei.type]] === "property" &&
        edgeName(e) === property
      )
        return heap.edges[e + ei.to_node] / nw;
    }
    return undefined;
  };
  const simulationStates = resources.simulation.map((index) => {
    const state = propertyTarget(index, "state");
    const status =
      state === undefined ? undefined : propertyTarget(state, "status");
    return {
      id: heap.nodes[index * nw + ni.id],
      status: status === undefined ? "unknown" : name(status),
    };
  });
  return {
    ids,
    summary: {
      nodes: count,
      simulationStates,
      totalsByType,
      resourceSignatures: Object.fromEntries(
        Object.entries(resources).map(([key, nodes]) => [
          key,
          { count: nodes.length, paths: nodes.slice(0, 3).map(path) },
        ]),
      ),
      nativeResources: [...groups.values()]
        .filter((g) =>
          /^(native|object): (HTMLCanvasElement|HTMLAudioElement|WebGLRenderingContext|WebGL2RenderingContext|AudioContext)$/.test(
            g.key,
          ),
        )
        .map(summarize),
      diagnosticResources: [...groups.values()]
        .filter((g) =>
          /^(native|object): (MessagePort|blink::NetworkResourcesData::ResourceData)$/.test(
            g.key,
          ),
        )
        .map(summarize),
      largestNewGroups: [...groups.values()]
        .sort((a, b) => b.newBytes - a.newBytes)
        .slice(0, 20)
        .map(summarize),
    },
  };
}
