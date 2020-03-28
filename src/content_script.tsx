import * as TSX from "jsx-dom";

import {SimplifiedImpl} from "./parser";
import {assert} from "./util";
import {includes} from "./comparer";
import {NormalizedImpl, normalizeImpl} from "./normalizer";

type Entry = { text: string, item: NormalizedImpl, element: Element };
type UnparsedItem = { text: string, element: Element };

const groups: { representative: Entry | null, entries: (Entry | UnparsedItem)[]}[] = [];

for (const element of [...document.querySelectorAll(".impl")]) {
    const text = element.querySelector(".in-band")?.textContent ?? "";
    const parsed = SimplifiedImpl.Implementation.parse(text);
    if (!parsed.status) {
        groups.push({
            representative: null,
            entries: [{
                text, element
            }]
        });
        continue;
    }
    const item = normalizeImpl(parsed.value);
    const entry = { text, item, element };

    let firstItem = true;
    for(const group of groups) {
        if (group.representative === null) {
            continue
        }

        const newIncludesExisting = includes(item, group.representative.item);
        const existingIncludesNew = includes(group.representative.item, item);
        if (existingIncludesNew) {
            group.representative = entry;
            group.entries.push(entry);
            firstItem = false;
            break;
        } else if (newIncludesExisting) {
            group.entries.push(entry);
            firstItem = false;
            break;
        }
    }
    if (firstItem) {
        groups.push({
            representative: entry,
            entries: [entry],
        });
    }
}

for (const {representative, entries} of groups) {
    if (entries.length == 1) {
        continue
    }
    assert(representative);
    const div = document.createElement("div");
    representative.element.insertAdjacentElement('beforebegin', div);
    div.innerHTML = ("<p> * generated variadic items</p>");

    const subdiv = document.createElement("div");
    div.appendChild(subdiv);
    subdiv.className = "hidden";
    subdiv.setAttribute("style", "display:hidden; ");
    div.addEventListener('click', () => {
        if (subdiv.className === "hidden") {
            subdiv.className = "visible";
            subdiv.removeAttribute("style");
        } else {
            subdiv.className = "hidden";
            subdiv.setAttribute("style", "display:hidden; ");
        }
    });
    for (const entry of entries) {
        if (entry.element !== representative.element) {
            const parent = entry.element.parentNode;
            const element = entry.element;
            const nextSibling = entry.element.nextElementSibling;
            parent?.removeChild(element);
            if (nextSibling) {
                parent?.removeChild(nextSibling);
            }

            subdiv.appendChild(element);
            if (nextSibling) {
                subdiv.appendChild(nextSibling);
            }
        }
    }
}
