import * as P from "parsimmon";

import { SimplifiedImpl } from "./parser";

function parse<T>(parser: P.Parser<T>, text: string): boolean {
    const parsed = parser.parse(text);
    if (!parsed.status) {
        for (const [index, line] of text.split("\n").entries()) {
            console.error(line);
            if (index + 1 == parsed.index.line) {
                console.error(" ".repeat(parsed.index.column - 1) + "^", parsed.expected);
            }
        }
        return false;
    } else {
        console.log(text);
        console.info(parsed.value);
        return true;
    }
}

for (const impl of document.querySelectorAll(".impl")) {
    const text = impl.querySelector(".in-band")?.textContent ?? "";
    if (!parse(SimplifiedImpl.Implementation, text)) {
    }
}
