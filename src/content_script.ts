import {SimplifiedImpl} from "./parser";
import {assert} from "./util";
import {includes} from "./comparer";
import {NormalizedImpl, normalizeImpl} from "./normalizer";

type Item = { text: string, normalized: NormalizedImpl, impl: Element };
type UnparsedItem = { text: string, impl: Element };

const groups: { representative: Item | null, items: (Item | UnparsedItem)[]}[] = [];

for (const impl of [...document.querySelectorAll(".impl")]) {
    const text = impl.querySelector(".in-band")?.textContent ?? "";
    const parsed = SimplifiedImpl.Implementation.parse(text);
    if (!parsed.status) {
        groups.push({
            representative: null,
            items: [{
                text, impl
            }]
        });
        continue;
    }
    const normalized = normalizeImpl(parsed.value);
    const item = { text, normalized, impl};

    let firstItem = true;
    for(const group of groups) {
        if (group.representative === null) {
            continue
        }

        const newIncludesExisting = includes(normalized, group.representative.normalized);
        const existingIncludesNew = includes(group.representative.normalized, normalized);
        if (existingIncludesNew) {
            group.representative = item;
            group.items.push(item);
            firstItem = false;
            break;
        } else if (newIncludesExisting) {
            group.items.push(item);
            firstItem = false;
            break;
        }
    }
    if (firstItem) {
        groups.push({
            representative: item,
            items: [item],
        });
    }
}

for (const {representative, items} of groups) {
    if (items.length == 1) {
        continue
    }
    assert(representative);
    const div = document.createElement("div");
    representative.impl.insertAdjacentElement('beforebegin', div);
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
    for (const item of items) {
        if (item.impl !== representative.impl) {
            const parent = item.impl.parentNode;
            const impl = item.impl;
            const nextSibling = item.impl.nextElementSibling;
            parent?.removeChild(impl);
            if (nextSibling) {
                parent?.removeChild(nextSibling);
            }

            subdiv.appendChild(impl);
            if (nextSibling) {
                subdiv.appendChild(nextSibling);
            }
        }
    }
}
