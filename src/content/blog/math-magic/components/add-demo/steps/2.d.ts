type Length<T extends any[]> = T["length"];

type ToTuple<T extends number, Acc extends 0[] = []> = ... 
// 2: create `ToTuple`, which takes two generics,
// `T` & `Acc`. `Acc` will have a default value of [].
