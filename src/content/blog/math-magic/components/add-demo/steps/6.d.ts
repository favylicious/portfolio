type Length<T extends any[]> = T["length"];

type ToTuple<T extends number, Acc extends 0[] = []> = 
    Length<Acc> extends T
    	? Acc
	    : ToTuple<T, [...Acc, 0]>;

type Add<A extends number, B extends number> =
    Length<[...ToTuple<A>, ...ToTuple<B>]> & number
// 6. finally, get the length of `A` & `B` wrapped with `ToTuple`
// and concatenate them together
