import {CreateBlitQuadGeometry} from './PopEngine/CommonGeometry.js'
import {GetNormalisedRect,GrowRect} from './PopEngine/Math.js'

const NodeBoxVert = `
#version 100
precision highp float;
attribute vec2 TexCoord;
uniform vec4 Rect;
varying vec2 uv;
void main()
{
	gl_Position.xy = mix( Rect.xy, Rect.xy+Rect.zw, TexCoord );
	gl_Position.xy = mix( vec2(-1,1), vec2(1,-1), gl_Position.xy );
	gl_Position.z = 0.0;
	gl_Position.w = 1.0;
	uv = TexCoord;
}
`;

const NodeBoxFrag = `
#version 100
precision highp float;
varying vec2 uv;
void main()
{
	gl_FragColor = vec4( uv, 0.0, 1.0 );
}
`;

export class Graph_t
{
	constructor()
	{
		this.Nodes = {};
		this.LastIdentCounter = 3000;
	}
	
	CreateNode(Node)
	{
		Node = Object.assign({},Node);
		
		this.LastIdentCounter++;
		Node.Ident = this.LastIdentCounter;
		
		this.Nodes[Node.Ident] = Node;
		
		return Node;
	}
	
	GetNode(Ident)
	{
		return this.Nodes[Ident];
	}
}


//	UI meta for a node
class NodeBox_t
{
	constructor(Rect)
	{
		this.Rect = Rect;
	}
	
	static GetDefaultRect(Index)
	{
		const Width = 40;
		const Height = 20;
		const Spacing = 5;
		const x = Index * (Width+Spacing);
		const y = 0;
		return [x,y,Width,Height];
	}
	
	GetInputRect(Index)
	{
		const Pad = 2;
		const w = 4;
		const h = w;
		const x = Pad;
		const y = Pad + (Index*(h+Pad));
		return [x,y,w,h];
	}
	
	GetOutputRect(Index)
	{
		const Pad = 2;
		const w = 4;
		const h = w;
		const x = this.Rect[2] - Pad - w;
		const y = Pad + (Index*(h+Pad));
		return [x,y,w,h];
	}
};

export default class GraphRenderer_t
{
	constructor()
	{
		this.Graph = new Graph_t();
		this.ScrollXy = [0,0];
		this.ZoomMultiplier = 1;	//	units... per pixel?
		
		this.NodeBoxes = {};	//	[Ident] = box
		
		this.BoxGeometry = null;
		this.BoxShader = null;
	}
	
	Zoom(Amount)
	{
		this.ZoomMultiplier -= Amount;
		if ( this.ZoomMultiplier < 0.1 )
			this.ZoomMultiplier = 0.1;
	}
	
	ScrollPx(Deltax,Deltay)
	{
		Deltax /= this.ZoomMultiplier;
		Deltay /= this.ZoomMultiplier;
		this.ScrollXy[0] += Deltax;
		this.ScrollXy[1] += Deltay;
	}

	CreateNode(Node)
	{
		Node = this.Graph.CreateNode(Node);
		const Box = this.GetNodeBox(Node);
	}
	
	GetNodeBox(Node)
	{
		if ( !this.NodeBoxes.hasOwnProperty(Node.Ident) )
		{
			const Rect = NodeBox_t.GetDefaultRect( Object.keys(this.NodeBoxes).length );
			const NewBox = new NodeBox_t(Rect);
			this.NodeBoxes[Node.Ident] = NewBox;
		}
		return this.NodeBoxes[Node.Ident];
	}
	
	async LoadAssets(RenderContext)
	{
		if ( !this.BoxGeometry )
		{
			const Geo = CreateBlitQuadGeometry();
			this.BoxGeometry = await RenderContext.CreateGeometry(Geo);
		}
		
		if ( !this.BoxShader )
		{
			this.BoxShader = await RenderContext.CreateShader( NodeBoxVert, NodeBoxFrag, null, ['TexCoord'] );
		}
	}
	
	GetRenderCommands(ViewRect)
	{
		//	scroll = center
		ViewRect[0] = - (ViewRect[2]/2);
		ViewRect[1] = - (ViewRect[3]/2);
		ViewRect[0] -= this.ScrollXy[0];
		ViewRect[1] -= this.ScrollXy[1];
		
		let ZoomedViewRect = ViewRect.slice();
		ZoomedViewRect = GrowRect( ZoomedViewRect, 1.0/this.ZoomMultiplier );
		
		const Commands = [];
		
		for ( let Box of Object.values(this.NodeBoxes) )
		{
			const Uniforms = {};
			Uniforms.Rect = GetNormalisedRect( Box.Rect, ZoomedViewRect );
			
			Commands.push(['Draw',this.BoxGeometry,this.BoxShader,Uniforms]);
		}
		
		return Commands;
	}
}
