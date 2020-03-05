import {
    GenericParam,
    Impl,
    LifetimeParam,
    SimplifiedImpl,
    TraitBound,
    Type, TypeNoBounds,
    TypeParam,
    TypeParamBound,
    TypePath
} from "./parser";

function assert(condition: any, msg?: string): asserts condition {
    if (!condition) {
        throw new Error(msg);
    }
}

function defaultCompare<T>(a: T, b: T): number {
    return a > b ? -1 : a < b ? 1 : 0;
}

function sortDedup<T>(array: T[], compare: (lhs: T, rhs: T) => number = defaultCompare): T[] {
    if (array.length <= 1) {
        return array;
    }
    const copy = [...array];
    copy.sort(compare);

    const result = [copy[0]];
    for (let i = 1; i < result.length; i++) {
        if (compare(copy[i - 1], copy[i]) == 0) {
            continue;
        }
        result.push(copy[i]);
    }
    return copy;
}

function compareArray<T>(a: T[], b: T[], compare: (lhs: T, rhs: T) => number = defaultCompare): number {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const ord = compare(a[i], b[i]);
        if (ord != 0) {
            return ord;
        }
    }

    if (a.length < b.length) {
        return -1;
    } else if (a.length > b.length) {
        return 1;
    } else {
        return compare(a[a.length - 1], b[b.length - 1]);
    }
}

function compareType(a: Type, b: Type): number {
    const nameOrd = a.name.localeCompare(b.name);
    if (nameOrd !== 0) {
        return nameOrd;
    }
    switch (a.name) {
        case "never":
            return 0;
        case "typePath":
            assert(a.name == b.name);
            return compareTypePath(a.value, b.value);
        case "tuple":
            assert(a.name == b.name);
            return compareArray(a.value, b.value, compareType);
        case "array": {
            assert(a.name == b.name);
            const typeOrd = compareType(a.value.type, b.value.type);
            if (typeOrd !== 0) {
                return typeOrd;
            }
            return defaultCompare(a.value.size, b.value.size);
        }
        case "slice":
            assert(a.name == b.name);
            return compareType(a.value, b.value);
        case "pointer": {
            assert(a.name == b.name);
            const mutOrd = defaultCompare(a.value.mut, b.value.mut);
            if (mutOrd !== 0) {
                return mutOrd;
            }
            return compareType(a.value.type, b.value.type);
        }
        case "reference": {
            assert(a.name == b.name);
            const lifetimeOrd = defaultCompare(a.value.lifetime, b.value.lifetime);
            if (lifetimeOrd !== 0) {
                return lifetimeOrd;
            }
            const mutOrd = defaultCompare(a.value.mut, b.value.mut);
            if (mutOrd !== 0) {
                return mutOrd;
            }
            return compareType(a.value.type, b.value.type);
        }
        case "implTraitTypeOneBound":
        case "traitObjectTypeOneBound":{
            assert(a.name == b.name);
            const optionalOrd = defaultCompare(a.value.optional, b.value.optional);
            if (optionalOrd !== 0) {
                return optionalOrd;
            }
            return compareTypePath(a.value.typePath, b.value.typePath);
        }
        case "implTrait":
        case "traitObject": {
            assert(a.name == b.name);
            return compareArray(a.value, b.value, compareTypeParamBound);
        }
    }
}

function compareTypePath(a: TypePath, b: TypePath): number {
    if (a.path < b.path) {
        return -1;
    } else if (a.path > b.path) {
        return 1;
    }
    const genericArgsA = a.genericArgs ?? [];
    const genericArgsB = b.genericArgs ?? [];
    const typeBeginA = genericArgsA.findIndex(x => typeof x !== "string");
    const typeBeginB = genericArgsB.findIndex(x => typeof x !== "string");

    return compareArray(
        genericArgsA.slice(typeBeginA) as Type[],
        genericArgsB.slice(typeBeginB) as Type[],
        compareType);
}

function compareTypeParamBound(a: TypeParamBound, b: TypeParamBound): number {
    // Lifetime first
    if (typeof a == "string" && typeof b == "string") {
        return a.localeCompare(b);
    } else if (typeof a == "string") {
        return -1;
    } else if (typeof b == "string") {
        return 1;
    }
    // Non-optional first
    if (!a.optional && b.optional) {
        return -1;
    } else if (a.optional && !b.optional) {
        return 1;
    }
    return compareTypePath(a.typePath, b.typePath);
}

// a includes b
function includesArray<T>(a: T[], b: T[], include: (lhs: T, rhs: T) => boolean): boolean {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (!include(a[i], b[i])) {
            return false
        }
    }

    return a.length >= b.length;
}

// a includes b
function includes(implA: NormalizedImpl, implB: NormalizedImpl): boolean {
    function includesType(a: Type, b: Type): boolean {
        const nameOrd = a.name.localeCompare(b.name);
        if (nameOrd !== 0) {
            return false;
        }

        switch (a.name) {
            case "never":
                return true;
            case "typePath":
                assert(a.name == b.name);
                return includesTypePath(a.value, b.value);
            case "tuple":
                assert(a.name == b.name);
                return includesArray(a.value, b.value, includesType);
            case "array": {
                assert(a.name == b.name);
                if (a.value.size < b.value.size) {
                    return false;
                }
                return includesType(a.value.type, b.value.type);
            }
            case "slice":
                assert(a.name == b.name);
                return includesType(a.value, b.value);
            case "pointer": {
                assert(a.name == b.name);
                if (a.value.mut !== b.value.mut) {
                    return false;
                }
                return includesType(a.value.type, b.value.type);
            }
            case "reference": {
                assert(a.name == b.name);
                // TODO: ignored lifetime?
                if (a.value.mut != b.value.mut) {
                    return false;
                }
                return includesType(a.value.type, b.value.type);
            }
            case "implTraitTypeOneBound":
            case "traitObjectTypeOneBound":{
                assert(a.name == b.name);
                if (!a.value.optional && b.value.optional) {
                    return false;
                }
                return includesTypePath(a.value.typePath, b.value.typePath);
            }
            case "implTrait":
            case "traitObject": {
                assert(a.name == b.name);
                return includesTypeParamBounds(a.value, b.value);
            }
        }
    }

    function includesTypePath(a: TypePath, b: TypePath): boolean {
        if (a.path != b.path) {
            return false;
        }
        const genericArgsA = a.genericArgs ?? [];
        const genericArgsB = b.genericArgs ?? [];
        const typeBeginA = genericArgsA.findIndex(x => typeof x !== "string");
        const typeBeginB = genericArgsB.findIndex(x => typeof x !== "string");

        return includesArray(
            genericArgsA.slice(typeBeginA) as Type[],
            genericArgsB.slice(typeBeginB) as Type[],
            includesType);
    }

    function includesTypeParamBounds(a: TypeParamBound[], b: TypeParamBound[]) : boolean {
        const typeBeginA = a.findIndex(x => typeof x !== "string");
        const typeBeginB = b.findIndex(x => typeof x !== "string");

        return includesArray(
            a.slice(typeBeginA) as TraitBound[],
            b.slice(typeBeginB) as TraitBound[],
            includesTraitBound);
    }

    function includesTraitBound(a: TraitBound, b: TraitBound): boolean {
        if (!a.optional && b.optional) {
            return false;
        }
        return includesTypePath(a.typePath, b.typePath);
    }

    if (implA.not != implB.not) {
        return false;
    }

    if (implA.trait && implB.trait) {
        if (!includesTypePath(implA.trait, implB.trait)) {
            return false;
        }
    } else if (!implA.trait && !implB.trait) {
        // Nothing
    }
    return includesType(implA.type, implB.type);
}

type NormalizedImpl = {
    generics: { [key: string]: GenericParam };
    not: boolean;
    trait?: TypePath;
    type: Type;
};

function normalizeImpl(impl: Impl): NormalizedImpl {
    const generics: { [key: string]: GenericParam } = {};
    for (const param of impl.generics) {
        if ("lifetimeParam" in param) {
            generics[param.lifetimeParam] = param;
        } else {
            generics[param.typeParam] = param;
        }
    }

    for (const param of impl.where ?? []) {
        if ("lifetimeParam" in param) {
            const lifetimeParam = generics[param.lifetimeParam] as LifetimeParam;
            lifetimeParam.bounds.push(...param.bounds);
            generics[param.lifetimeParam].bounds = sortDedup(generics[param.lifetimeParam].bounds);
        } else {
            console.assert(!param.assign);
            const typeParam = generics[param.typeParam] as TypeParam;
            typeParam.bounds.push(...param.bounds);
            generics[param.typeParam].bounds = sortDedup(generics[param.typeParam].bounds, compareTypeParamBound);
        }
    }

    const paramRewrite: { [param: string]: string } = {};
    for (const [i, param] of impl.generics.filter(x => "typeParam" in x).entries()) {
        assert("typeParam" in param);
        paramRewrite[param.typeParam] = `T${i}`;
    }

    function rewriteTypePath(typePath: TypePath): TypePath {
        if (typePath.path in paramRewrite) {
            return {
                path: paramRewrite[typePath.path],
                genericArgs: typePath.genericArgs ? typePath.genericArgs.map(x => typeof x === "string" ? x : rewriteType(x)) : null,
            }
        } else {
            return typePath;
        }
    }

    function rewriteTypeParamBound(x: TypeParamBound): TypeParamBound {
        if (typeof x === "string") {
            return x;
        }
        return {
            ...x,
            typePath: rewriteTypePath(x.typePath),
        };
    }

    function rewriteType(type: Type): Type {
        switch (type.name) {
            case "never":
                return type;
            case "typePath":
                return {
                    ...type,
                    value: rewriteTypePath(type.value)
                };
            case "tuple":
                return {
                    ...type,
                    value: type.value.map(rewriteType),
                };
            case "array": {
                return {
                    ...type,
                    value: {
                        ...type.value,
                        type: rewriteType(type.value.type),
                    },
                };
            }
            case "slice":
                return {
                    ...type,
                    value: rewriteType(type.value),
                };
            case "pointer": {
                return {
                    ...type,
                    value: {
                        ...type.value,
                        type: rewriteType(type.value.type) as TypeNoBounds,
                    },
                };
            }
            case "reference":
                return {
                    ...type,
                    value: {
                        ...type.value,
                        type: rewriteType(type.value.type) as TypeNoBounds,
                    },
                };
            case "implTraitTypeOneBound":
            case "traitObjectTypeOneBound":
                return {
                    ...type,
                    value: {
                        ...type.value,
                        typePath: rewriteTypePath(type.value.typePath),
                    }
                };
            case "implTrait":
            case "traitObject": {
                return {
                    ...type,
                    value: type.value.map(rewriteTypeParamBound),
                };
            }
        }
    }

    const trait = impl.trait ? rewriteTypePath(impl.trait) : undefined;
    const type = rewriteType(impl.type);

    return {
        not: impl.not,
        trait,
        type,
        generics
    };
}

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
    console.log(item);
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
