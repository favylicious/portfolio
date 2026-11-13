type Length<T extends any[]> = T["length"];
type ToTuple<T extends number, Acc extends 0[] = []> = Length<Acc> extends T
	? Acc
	: ToTuple<T, [...Acc, 0]>;
type Add<A extends number, B extends number> = 
	Length<[...ToTuple<A>, ...ToTuple<B>]> & number;
// ---cut---
type Fibonacci<
	N extends number,
	Sum extends number = 1,
	Prev extends number = 0,
	Counter extends number = 1
> = Counter extends N 
	? Sum 
	: Fibonacci<N, Add<Sum, Prev>, ...