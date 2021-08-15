export default 'Hello';
import Pop from './PopEngine/PopEngine.js'
import GraphRenderer_t from './GraphRenderer.js'

let GraphRenderer = null;

async function GetGraphRenderCommands(ViewRect)
{
	const Commands = [];
	
	Commands.push(['SetRenderTarget',null,[0,1,1]]);
	
	if ( GraphRenderer )
	{
		const GraphCommands = GraphRenderer.GetRenderCommands(ViewRect);
		Commands.push( ...GraphCommands );
	}
	
	return Commands;
}

async function LoadGraphAssets(RenderContext)
{
	if ( GraphRenderer )
	{
		await GraphRenderer.LoadAssets(RenderContext);
	}
}

export function SetFlowGraph(Flow)
{
	GraphRenderer = new GraphRenderer_t();
	
	for ( let Node of Flow )
		GraphRenderer.CreateNode(Node);
}

export async function StartGraphRenderer(RenderViewName='Graph')
{
	let Window = null;
	let RenderView = new Pop.Gui.RenderView(Window,RenderViewName);
	let RenderContext = new Pop.Opengl.Context(RenderView);
	
	let LastGrabPos = {};	//	[Button]
	
	RenderView.OnMouseScroll = function(x,y,Button,Scroll)
	{
		if ( GraphRenderer )
		{
			GraphRenderer.Zoom(Scroll[1] * 0.3);
		}
	}
	RenderView.OnMouseDown = function(x,y,Button)
	{
		LastGrabPos[Button] = [x,y];
	}
	RenderView.OnMouseMove = function(x,y,Button)
	{
		if ( Button == 'Right' )
		{
			const Deltax = x - LastGrabPos.Right[0];
			const Deltay = y - LastGrabPos.Right[1];
			if ( GraphRenderer )
			{
				GraphRenderer.ScrollPx(Deltax,Deltay);
				LastGrabPos.Right = [x,y];
			}
		}
	}
	
	while ( true )
	{
		const ViewRect = [0,0,...RenderContext.GetScreenRect().slice(2)];
		await LoadGraphAssets(RenderContext);
		const Commands = await GetGraphRenderCommands(ViewRect);
		await RenderContext.Render(Commands);
	}
}
