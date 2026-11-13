type Length<T extends any[]> = T["length"];

type ToTuple<T extends number, Acc extends 0[] = []> = 
    Length<Acc> extends T
    	? Acc
	    : ToTuple<T, [...Acc, 0]>;

type Add<A extends number, B extends number> = ...
// 5. create the `Add` type, taking in two number inputs, A & B.
