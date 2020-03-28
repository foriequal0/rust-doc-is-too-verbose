import {GenericParam, Impl, LifetimeParam, Type, TypeNoBounds, TypeParam, TypeParamBound, TypePath} from "./parser";
import {assert, sortDedup} from "./util";
import {compareTypeParamBound} from "./comparer";

export type NormalizedImpl = {
    generics: { [key: string]: GenericParam };
    not: boolean;
    trait?: TypePath;
    type: Type;
};

export function normalizeImpl(impl: Impl): NormalizedImpl {
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
        if ("path" in typePath && typePath.path in paramRewrite) {
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
