import * as P from "parsimmon";

function name<T>(name: string) {
    return function(parser: P.Parser<T>) {
        return parser.map(value => ({ name, value }));
    };
}

function T(token: string): P.Parser<string> {
    return P.string(token).trim(P.optWhitespace);
}

const Optional = <T>(parser: P.Parser<T>): P.Parser<T | null> => P.alt(parser, P.of(null));

function Paren<T>(body: P.Parser<T>): P.Parser<T> {
    return body.wrap(T("("), T(")"));
}

function Bracket<T>(body: P.Parser<T>): P.Parser<T> {
    return body.wrap(T("<"), T(">"));
}

const Comma = T(",");
const OptionalComma = Optional(T(","));

function CommaSep<T>(
    parser: P.Parser<T>,
    option?: { required?: boolean; trailingComma?: boolean | "required" }
): P.Parser<T[]> {
    const { required = false, trailingComma = true } = option ?? {};

    if (required) {
        switch (trailingComma) {
            case true:
                return parser.sepBy1(Comma).skip(OptionalComma);
            case false:
                return parser.sepBy1(Comma);
            case "required":
                return parser.skip(Comma).atLeast(1);
        }
    } else {
        switch (trailingComma) {
            case true:
                return P.alt(parser.sepBy1(Comma).skip(Comma), parser.sepBy(Comma));
            case false:
                return parser.sepBy(Comma);
            case "required":
                return parser.skip(Comma).many();
        }
    }
}

export type Impl = {
    generics: GenericParam[];
    not: boolean;
    trait?: TypePath;
    type: Type;
    where: GenericParam[] | null;
};

export type GenericParam = LifetimeParam | TypeParam;
export type LifetimeParam = { lifetimeParam: string; bounds: LifetimeBound[] };
export type TypeParam = { typeParam: string; bounds: TypeParamBound[]; assign: Type | null };

export type TypeParamBound = LifetimeBound | TraitBound;
export type LifetimeBound = string;
export type TraitBound = { optional: boolean; typePath: TypePath };

export type TypePath = Path | FnPath;
export type Path = {
    path: string;
    genericArgs: GenericArg[] | null;
};
export type GenericArg = string | Type;

export type FnPath = {
    modifiers: string;
    fn: string;
    inputs: Type[];
    return: Type | null;
};

export type Type =
    | TypeNoBounds
    | { name: "implTrait"; value: TypeParamBound[] }
    | { name: "traitObject"; value: TypeParamBound[] };
export type TypeNoBounds =
    | { name: "never"; value: "!" }
    | { name: "typePath"; value: TypePath }
    | { name: "tuple"; value: Type[] }
    | { name: "array"; value: { type: Type; size: number } }
    | { name: "slice"; value: Type }
    | { name: "pointer"; value: Pointer }
    | { name: "reference"; value: Reference }
    | { name: "implTraitTypeOneBound"; value: TraitBound }
    | { name: "traitObjectTypeOneBound"; value: TraitBound };
export type Pointer = { mut: boolean; type: TypeNoBounds };
export type Reference = { lifetime: LifetimeBound | null; mut: boolean; type: TypeNoBounds };
export type Where = GenericParam[];

// Simplified version of https://doc.rust-lang.org/reference/items/implementations.html
// Just enough to parse some std lib impls.
// It doesn't cover especially
//  * associated type assignment: SomeTrait<AssocType = SomeType>
//  * const generic: <const N: usize>
//  * qualified path in type: <T as SomeTrait>
export const SimplifiedImpl = P.createLanguage({
    Identifier: () => P.regexp(/([_a-zA-Z0-9]+|\.\.\.)/).trim(P.optWhitespace),
    Lifetime: () => P.regexp(/'[_a-zA-Z0-9]+/).trim(P.optWhitespace),

    Implementation: r => P.alt(r.TraitImpl, r.InherentImpl),
    InherentImpl: r =>
        P.seqObj<Impl>(
            T("impl"),
            ["generics", Optional(r.Generics).map(x => x ?? [])],
            ["type", r.Type],
            ["where", Optional(r.WhereClause)]
        ),
    TraitImpl: r =>
        P.seqObj<Impl>(
            Optional(T("unsafe")),
            T("impl"),
            ["generics", Optional(r.Generics).map(x => x ?? [])],
            ["not", Optional(T("!")).map(x => x != null)],
            ["trait", r.TypePath],
            T("for"),
            ["type", r.Type],
            ["where", Optional(r.WhereClause)]
        ),

    Generics: (r): P.Parser<GenericParam[]> => Bracket(CommaSep(P.alt(r.LifetimeParam, r.TypeParam))),
    LifetimeParam: r =>
        P.seqObj<LifetimeParam>(
            ["lifetimeParam", r.Lifetime],
            ["bounds", Optional(T(":").then(r.LifetimeBounds)).map(x => x ?? [])]
        ),
    TypeParam: r =>
        P.seqObj<TypeParam>(
            ["typeParam", r.Identifier],
            ["bounds", Optional(T(":").then(r.TypeParamBounds)).map(x => x ?? [])],
            ["assign", Optional(T("=").then(r.Type))]
        ),

    TypeParamBounds: r => P.alt<TypeParamBound>(r.Lifetime, r.TraitBound).sepBy1(T("+")),
    TraitBound: r => P.seqObj<TraitBound>(["optional", Optional(T("?")).map(x => x == "?")], ["typePath", r.TypePath]),
    LifetimeBounds: (r): P.Parser<LifetimeBound[]> => r.Lifetime.sepBy1(T("+")),

    TypePath: r =>
        P.alt<TypePath>(
            P.seqObj<FnPath>(
                [
                    "modifiers",
                    P.alt(T("unsafe"), T("extern"), T('"C"'))
                        .many()
                        .map(x => x.join(" "))
                ],
                ["fn", r.TypePathSegments.lookahead(T("("))],
                ["inputs", Paren(CommaSep(r.Type))],
                ["return", Optional(T("->").then(r.Type))]
            ),
            P.seqObj<Path>(["path", r.TypePathSegments], ["genericArgs", Optional(r.GenericArgs)])
        ),
    TypePathSegments: r => r.Identifier.sepBy1(T("::")).map(x => x.join("::")),
    GenericArgs: r =>
        P.alt(
            P.seq(T("<"), T(">")).map(() => []),
            Bracket(CommaSep(r.Lifetime, { required: true })),
            Bracket(CommaSep(r.Type, { required: true })),
            Bracket(
                P.seqMap(
                    CommaSep(r.Lifetime, { required: true, trailingComma: "required" }),
                    CommaSep(r.Type, { required: true }),
                    (a, b) => [...a, ...b]
                )
            )
        ),

    Type: r =>
        P.alt(
            T("impl")
                .then(r.TypeParamBounds)
                .thru(name("implTrait")),
            T("dyn")
                .then(r.TypeParamBounds)
                .thru(name("traitObject")),
            r.TypeNoBounds
        ),
    TypeNoBounds: r =>
        P.alt(
            T("!").thru(name("never")),
            // prettier-ignore
            P.alt(
                P.seq(T("("), T(")")).then(P.of([])),
                Paren(CommaSep(r.Type, {required: true}))
            ).thru(name("tuple")),
            // prettier-ignore
            P.seqObj<{ type: Type; size: number }>(
                ["type", r.Type], T(";"), ["size", P.digits.map(Number)])
                .wrap(T("["), T("]"))
                .thru(name("array")),
            r.Type.wrap(T("["), T("]")).thru(name("slice")),
            P.seqObj<Pointer>(
                T("*"),
                ["mut", P.alt(T("mut"), T("const")).map(x => x == "mut")],
                ["type", r.TypeNoBounds]
            ).thru(name("pointer")),
            P.seqObj<Reference>(
                T("&"),
                ["lifetime", Optional(r.Lifetime)],
                ["mut", Optional(T("mut")).map(x => !!x)],
                ["type", r.TypeNoBounds]
            ).thru(name("reference")),
            T("impl")
                .then(r.TraitBound)
                .thru(name("implTraitTypeOneBound")),
            T("dyn")
                .then(r.TraitBound)
                .thru(name("traitObjectTypeOneBound")),
            r.TypePath.thru(name("typePath"))
        ),
    WhereClause: r => T("where").then<Where>(CommaSep(r.WhereClauseItem)),
    WhereClauseItem: r => P.alt<GenericParam>(r.LifetimeWhereClauseItem, r.TypeBoundWhereClauseItem),
    LifetimeWhereClauseItem: r =>
        P.seqObj<LifetimeParam>(["lifetimeParam", r.Lifetime], T(":"), ["bounds", r.LifetimeBounds]),
    TypeBoundWhereClauseItem: r =>
        P.seqObj<TypeParam>(["typeParam", r.Identifier], T(":"), ["bounds", r.TypeParamBounds])
});
