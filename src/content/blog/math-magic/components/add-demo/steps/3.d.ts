type Length<T extends any[]> = T["length"];

type ToTuple<T extends number, Acc extends 0[] = []> = 
    Length<Acc> extends T
	    ? Acc
	    : ...
// 3: pass `Acc` into `Length` and check whether it matches `T`.
// if it does, we return `Acc` as our result...
