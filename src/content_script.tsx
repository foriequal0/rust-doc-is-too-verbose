import * as TSX from "jsx-dom";

import {SimplifiedImpl} from "./parser";
import {assert} from "./util";
import {includes} from "./comparer";
import {NormalizedImpl, normalizeImpl} from "./normalizer";


type Entry = { text: string, item: NormalizedImpl, impl: Element, implItems: Element | null };
type UnparsedItem = { text: string, impl: Element, implItems: Element | null };

const groups: { representative: Entry | null, entries: (Entry | UnparsedItem)[]}[] = [];

for (const impl of [...document.querySelectorAll(".impl")]) {
    const implItems = impl.nextElementSibling?.classList.contains("impl-items") ? impl.nextElementSibling : null;
    const text = impl.querySelector(".in-band")?.textContent ?? "";
    const parsed = SimplifiedImpl.Implementation.parse(text);
    if (!parsed.status) {
        groups.push({
            representative: null,
            entries: [{
                text, impl, implItems
            }]
        });
        continue;
    }
    const item = normalizeImpl(parsed.value);
    const entry = { text, item, impl, implItems };

    let firstItem = true;
    for(const group of groups) {
        if (group.representative === null) {
            continue
        }

        const newIncludesExisting = includes(item, group.representative.item);
        const existingIncludesNew = includes(group.representative.item, item);
        if (existingIncludesNew && newIncludesExisting) {
            continue;
        }
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

    // remove existing non-representitive items
    for (const entry of entries) {
        if (entry.impl !== representative.impl) {
            entry.impl.remove();
            entry.implItems?.remove();
        }
    }

    function toggle(e: Event, hidden: boolean) {
        const currentTarget = e.currentTarget as Element;
        currentTarget.parentElement?.insertAdjacentElement('afterend', createGeneratedSection(hidden));
        currentTarget.parentElement?.remove();
    }

    function createGeneratedSection(hidden: boolean) {
        if (hidden) {
            return <div>
                <a href="javascript:void(0)" class="collapse-toggle hidden-default collapsed" onClick={(e) => toggle(e, false)}>
                    [<span class="inner">+</span>] <span style={{textDecoration: "underline"}}>Show Generated variadic implementations</span>
                </a>
            </div>;
        } else {
            const items: Element[] = [];
            for (const entry of entries) {
                if (entry.impl !== representative?.impl) {
                    items.push(entry.impl);
                    if (entry.implItems) {
                        items.push(entry.implItems);
                    }
                }
            }
            return <div>
                <a href="javascript:void(0)" class="collapse-toggle hidden-default" onClick={(e) => toggle(e, true)}>
                    [<span class="inner">-</span>] <span style={{textDecoration: "underline"}}>Hide Generated variadic implementations</span>
                </a>
                <div style={{borderStyle:"dotted"}}>
                    {items}
                </div>
            </div>;
        }
    }

    if (representative.implItems) {
        representative.implItems.insertAdjacentElement('afterend', createGeneratedSection(true));
    } else {
        representative.impl.insertAdjacentElement('afterend', createGeneratedSection(true));
    }
}
