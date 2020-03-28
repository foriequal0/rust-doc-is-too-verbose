export function assert(condition: any, msg?: string): asserts condition {
    if (!condition) {
        throw new Error(msg);
    }
}

export function defaultCompare<T>(a: T, b: T): number {
    return a > b ? -1 : a < b ? 1 : 0;
}

export function sortDedup<T>(array: T[], compare: (lhs: T, rhs: T) => number = defaultCompare): T[] {
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
