import {TraitBound, Type, TypeParamBound, TypePath} from "./parser";
import {assert, defaultCompare} from "./util";
import {NormalizedImpl} from "./normalizer";

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
        case "traitObjectTypeOneBound": {
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

export function compareTypeParamBound(a: TypeParamBound, b: TypeParamBound): number {
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
    if (a.length > 0 && b.length === 0) {
        return false;
    }
    return a.length >= b.length;
}

// a includes b
export function includes(implA: NormalizedImpl, implB: NormalizedImpl): boolean {
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
            case "traitObjectTypeOneBound": {
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

    function includesTypeParamBounds(a: TypeParamBound[], b: TypeParamBound[]): boolean {
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
