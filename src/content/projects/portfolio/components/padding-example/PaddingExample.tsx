import { Slider } from "@content/components/slider/Slider";
import { useDemoWidth } from "@content/components/slider/useDemoWidth";

/**
 * Same content/TOC columns and breakpoints as GridExample, but the two `1fr` side columns
 * are replaced by real CSS padding (4rem each side). The fixed columns plus the padding
 * don't shrink, so at the narrower breakpoints the layout overflows its container.
 */
export const PaddingExample = () => {
	const { ref, style, setValue, label } = useDemoWidth();

	return (
		<>
			<div ref={ref} style={style} className="@container min-w-48 h-96 bg-white/5 rounded-md p-2">
				{/* the padding box: dashed outline + labels make the 4rem padding visible */}
				<div className="relative h-full @md:px-16 rounded-xs @md:border-2 @md:border-dashed @md:border-gray-300">
					<span className="hidden @md:grid absolute inset-y-0 left-0 w-16 place-items-center text-white font-bold">
						4rem
					</span>
					<span className="hidden @md:grid absolute inset-y-0 right-0 w-16 place-items-center text-white font-bold">
						4rem
					</span>
					<div
						className={
							"h-full grid grid-cols-1 justify-center gap-2 " +
							"@xs:grid-cols-[3fr_1fr] @md:grid-cols-[16rem_8rem] @[38rem]:grid-cols-[22rem_10em]"
						}
					>
						<div className="grid place-items-center bg-slate-800 rounded-xs border-2 border-dashed border-indigo-400 text-white font-bold">
							CONTENT
						</div>
						<div className="hidden @xs:grid @xs:min-w-24 place-items-center bg-slate-800 rounded-xs border-2 border-dashed border-indigo-400 text-lg text-white font-bold">
							TOC
						</div>
					</div>
				</div>
			</div>
			<div className="mt-8 mb-6 my-4 w-full px-24 flex flex-col justify-center items-center space-y-4">
				<Slider id="padding-example-slider" defaultValue={100} onChange={setValue}>
					<span className="text-white">Current width: </span>
					<span className="text-primary">{label}</span>
				</Slider>
			</div>
		</>
	);
};
