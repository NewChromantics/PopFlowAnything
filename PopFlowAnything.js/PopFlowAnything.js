export default 'Hello';
import Pop from './PopEngine/PopEngine.js'


async function GetGraphRenderCommands()
{
	const Commands = [];
	
	Commands.push(['SetRenderTarget',null,[0,1,1]]);
	
	return Commands;
}

export async function StartGraphRenderer(RenderViewName='Graph')
{
	let Window = null;
	let RenderView = new Pop.Gui.RenderView(Window,RenderViewName);
	let RenderContext = new Pop.Opengl.Context(RenderView);
	
	while ( true )
	{
		const Commands = await GetGraphRenderCommands();
		await RenderContext.Render(Commands);
	}
}
