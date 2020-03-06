import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as process from "process";

import { JSDOM } from "jsdom";
import { Failure, Result, Success } from "parsimmon";

import { Impl, SimplifiedImpl } from "../src/parser";

function getAllHtml(root: string): string[] {
    const queue = [root];
    const result = [];
    while (queue.length > 0) {
        const [current] = queue.splice(0, 1);
        const dirents = fs.readdirSync(current, { withFileTypes: true });
        for (const dirent of dirents) {
            if (dirent.isFile()) {
                if (dirent.name.endsWith(".html") || dirent.name.endsWith(".htm")) {
                    result.push(path.join(current, dirent.name));
                }
            } else if (dirent.isDirectory()) {
                queue.push(path.join(current, dirent.name));
            }
        }
    }
    return result;
}

async function getImpls(doc: string): Promise<string[]> {
    const result = [];

    const dom = await JSDOM.fromFile(doc);
    const impls = dom.window.document.querySelectorAll(".impl");
    for (const impl of impls ?? []) {
        const text = impl.querySelector(".in-band")?.textContent ?? "";
        result.push(text);
    }

    return result;
}

function sample<T>(list: T[], ratio: number): T[] {
    const result = [];
    for (const item of list) {
        if (Math.random() < ratio) {
            result.push(item);
        }
    }
    return result;
}

async function parseSample(docs: string[], docFreq: number, implFreq: number) {
    const sampledDoc = sample(docs, docFreq);
    const impls = (await Promise.all(sampledDoc.map(getImpls))).reduce((acc, val) => acc.concat(val), []);
    const supportedImpls = impls.filter(
        x => !x.includes("const ") // const generic
            && !(x.includes(" as ")) // qualified path
    );
    const interestingImpls = supportedImpls.filter(
        x => (x.includes("<") && x.includes(">") || x.includes("(") && x.includes(")")) // Generic or tuples
            && x.includes(",") // Has multiple items
    );
    const sampledImpls = sample(interestingImpls, implFreq);
    const results = sampledImpls.map(text => ({
        text,
        parsed: SimplifiedImpl.Implementation.parse(text) as Result<Impl>
    }));
    const success = results.filter(result => result.parsed.status) as { text: string; parsed: Success<Impl> }[];
    const fail = results.filter(result => !result.parsed.status) as { text: string; parsed: Failure }[];

    console.group("Parser coverage:");
    console.log("total docs:", docs.length);
    console.log("sampled documents:", sampledDoc.length);
    console.log("impls:", impls.length);
    console.log("supported impls:", supportedImpls.length);
    console.log("interesting impls:", interestingImpls.length);
    console.log("sampled impls:", sampledImpls.length);
    console.log("success:", success.length);
    console.log("percentage:", Math.round((success.length / sampledImpls.length) * 100 * 100)/100, "%");
    console.groupEnd();
    console.group("failed impls:");
    let count = 0;
    for (const { text, parsed } of fail) {
        count += 1;
        if (count > 100) {
            console.log("> 100 parse errors");
            break;
        }
        for (const [index, line] of text.split("\n").entries()) {
            console.log(line);
            if (index + 1 == parsed.index.line) {
                console.log(" ".repeat(parsed.index.column - 1) + "^", parsed.expected);
            }
        }
    }
    console.groupEnd();
}

async function main(): Promise<void> {
    if (process.env.DISABLE_COVERAGE) {
        return;
    }
    const rustc = cp.execFileSync("rustup", ["which", "rustc"], { encoding: "utf-8" });
    const std = path.join(path.dirname(rustc) + "/../share/doc/rust/html/std/");
    const docs = getAllHtml(std);

    const docFreq = parseFloat(process.argv[2] ?? process.env.DOC_FREQ ?? 1.0);
    const implFreq = parseFloat(process.argv[3] ?? process.env.IMPL_FREQ ?? 1.0);
    await parseSample(docs, docFreq, implFreq);
}

main().catch(err => {
    console.error(err);
});
