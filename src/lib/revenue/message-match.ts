// Reads English ICU messages back out of the texts they rendered: each message is compiled once
// into a regular expression whose groups give its arguments, so a text stored in English can be
// shown in another language. Supports what the revenue messages use: arguments, `{n, number}`,
// plurals with `#` and `=N`, selects, and ICU's apostrophe quoting. Pure functions.

export type MessageValues = Record<string, string | number>;

type Node =
  | { type: "text"; value: string }
  | { type: "argument"; name: string; number: boolean }
  | { type: "pound" }
  | { type: "plural" | "select"; name: string; options: { selector: string; nodes: Node[] }[] };

/** Parses the subset of ICU MessageFormat above; anything else throws. */
export function parseMessage(source: string): Node[] {
  let at = 0;
  const fail = (why: string): never => {
    throw new Error(`${why} at ${at} in ${JSON.stringify(source)}`);
  };
  const skipSpace = () => {
    while (/\s/.test(source[at] ?? "")) at++;
  };
  const word = (stops: RegExp) => {
    const start = at;
    while (at < source.length && !stops.test(source[at]!)) at++;
    return source.slice(start, at).trim();
  };
  const expect = (char: string) => {
    if (source[at] !== char) fail(`Expected ${char}`);
    at++;
  };

  function nodes(plural: boolean): Node[] {
    const found: Node[] = [];
    let text = "";
    const flush = () => {
      if (text) found.push({ type: "text", value: text });
      text = "";
    };
    while (at < source.length) {
      const char = source[at]!;
      if (char === "}") break;
      if (char === "'") {
        const next = source[at + 1];
        if (next === "'") {
          text += "'";
          at += 2;
        } else if (next === "{" || next === "}" || (plural && next === "#")) {
          // Quoted text runs to the next apostrophe that is not doubled.
          at++;
          while (at < source.length) {
            if (source[at] === "'" && source[at + 1] === "'") {
              text += "'";
              at += 2;
            } else if (source[at] === "'") {
              at++;
              break;
            } else text += source[at++];
          }
        } else {
          text += "'";
          at++;
        }
      } else if (char === "#" && plural) {
        flush();
        found.push({ type: "pound" });
        at++;
      } else if (char === "{") {
        flush();
        found.push(argument(plural));
      } else if (char === "<") fail("Tags are not supported");
      else {
        text += char;
        at++;
      }
    }
    flush();
    return found;
  }

  function argument(plural: boolean): Node {
    expect("{");
    const name = word(/[,}]/);
    if (!/^[A-Za-z_]\w*$/.test(name)) fail("Expected an argument name");
    if (source[at] === "}") {
      at++;
      return { type: "argument", name, number: false };
    }
    expect(",");
    const type = word(/[,}]/);
    if (type === "number") {
      expect("}");
      return { type: "argument", name, number: true };
    }
    if (type !== "plural" && type !== "select") return fail(`Unsupported argument type ${type}`);
    expect(",");
    const options: { selector: string; nodes: Node[] }[] = [];
    for (;;) {
      skipSpace();
      if (source[at] === "}") break;
      const selector = word(/[\s{}]/);
      if (!selector || selector.startsWith("offset:")) fail("Expected a selector");
      skipSpace();
      expect("{");
      options.push({ selector, nodes: nodes(type === "plural" || plural) });
      expect("}");
    }
    expect("}");
    if (!options.some((option) => option.selector === "other")) fail("Missing the other option");
    return { type, name, options };
  }

  const parsed = nodes(false);
  if (at < source.length) fail("Unexpected }");
  return parsed;
}

type Group =
  | { kind: "string"; name: string }
  | { kind: "number"; name: string }
  | { kind: "option"; name: string; selector: string; plural: boolean; pound: boolean };

/** A compiled message: the whole text, or the start of a text that goes on after a space. */
export type Matcher = {
  key: string;
  whole: RegExp;
  start: RegExp;
  groups: Group[];
  /** Characters of fixed text, so the most specific of several matching messages wins. */
  weight: number;
};

// A number as English formats it, with or without grouping (texts stored before grouping).
const NUMBER = String.raw`-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasPound = (nodes: Node[]): boolean =>
  nodes.some(
    (node) =>
      node.type === "pound" ||
      (node.type === "select" && node.options.some((option) => hasPound(option.nodes))),
  );

export function compileMessage(key: string, source: string): Matcher {
  const groups: Group[] = [];
  // A string argument that appears again must read the same; its first group is referred back to.
  const firstGroup = new Map<string, number>();
  let weight = 0;
  const emit = (nodes: Node[], plural: string | null, conditional: boolean): string =>
    nodes
      .map((node) => {
        if (node.type === "text") {
          weight += node.value.length;
          return escape(node.value);
        }
        if (node.type === "pound") {
          groups.push({ kind: "number", name: plural! });
          return `(${NUMBER})`;
        }
        if (node.type === "argument") {
          if (node.number) {
            groups.push({ kind: "number", name: node.name });
            return `(${NUMBER})`;
          }
          const first = firstGroup.get(node.name);
          if (first !== undefined) return `(?:\\${first})`;
          groups.push({ kind: "string", name: node.name });
          if (!conditional) firstGroup.set(node.name, groups.length);
          return String.raw`([\s\S]+?)`;
        }
        const isPlural = node.type === "plural";
        const options = node.options.map(({ selector, nodes: children }) => {
          const pound = isPlural && hasPound(children);
          if (isPlural && !pound && selector !== "one" && !/^=\d+$/.test(selector))
            throw new Error(`The ${selector} option of ${key} must show the number with #.`);
          groups.push({ kind: "option", name: node.name, selector, plural: isPlural, pound });
          return `()${emit(children, isPlural ? node.name : plural, true)}`;
        });
        return `(?:${options.join("|")})`;
      })
      .join("");
  const pattern = emit(parseMessage(source), null, false);
  return {
    key,
    whole: new RegExp(`^(?:${pattern})$`),
    start: new RegExp(`^(?:${pattern})(?= )`),
    groups,
    weight,
  };
}

/** Compiles every message, the most specific first. */
export function compileMessages(messages: Record<string, string>) {
  return Object.entries(messages)
    .map(([key, source]) => compileMessage(key, source))
    .sort((a, b) => b.weight - a.weight || a.groups.length - b.groups.length);
}

function valuesOf(match: RegExpExecArray, groups: Group[]) {
  const values: MessageValues = {};
  groups.forEach((group, index) => {
    const captured = match[index + 1];
    if (captured === undefined) return;
    if (group.kind === "string") values[group.name] = captured;
    else if (group.kind === "number") values[group.name] = Number(captured.replace(/,/g, ""));
    // A select's other option gives "other", which picks the other option in every language.
    else if (!group.plural) values[group.name] = group.selector;
    else if (!group.pound) {
      const exact = /^=(\d+)$/.exec(group.selector);
      values[group.name] = exact ? Number(exact[1]) : 1;
    }
  });
  return values;
}

export type MessageMatch = { key: string; values: MessageValues };

/**
 * The messages a text consists of, with their arguments: one message, or several joined by single
 * spaces, as notes are. Null when the text is not made of the messages.
 */
export function matchText(text: string, matchers: readonly Matcher[]): MessageMatch[] | null {
  const failed = new Set<number>();
  const from = (position: number): MessageMatch[] | null => {
    if (failed.has(position)) return null;
    const rest = text.slice(position);
    for (const matcher of matchers) {
      const match = matcher.whole.exec(rest);
      if (match) return [{ key: matcher.key, values: valuesOf(match, matcher.groups) }];
    }
    for (const matcher of matchers) {
      const match = matcher.start.exec(rest);
      if (!match) continue;
      const after = from(position + match[0].length + 1);
      if (after) return [{ key: matcher.key, values: valuesOf(match, matcher.groups) }, ...after];
    }
    failed.add(position);
    return null;
  };
  return text ? from(0) : null;
}
