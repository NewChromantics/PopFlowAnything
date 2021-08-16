import {CreateBlitQuadGeometry} from './PopEngine/CommonGeometry.js'
import {GetNormalisedRect,GrowRect,GetRectCenter} from './PopEngine/Math.js'

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


const NodeLineVert = `
#version 100
precision highp float;
attribute vec2 TexCoord;
uniform vec2 LineStart;
uniform vec2 LineEnd;
varying vec2 LinePosition;
uniform float LineWidth;
void main()
{
	vec2 Dir = normalize( LineEnd - LineStart );
	vec2 Cross = vec2( -Dir.y, Dir.x );
	vec2 Position = mix( LineStart, LineEnd, TexCoord.y );
	Position += mix( -Cross*LineWidth, Cross*LineWidth, TexCoord.x );	//	widen
	Position += mix( -Dir*LineWidth, Dir*LineWidth, TexCoord.y );	//	endcaps
	LinePosition = Position;
	gl_Position.xy = Position;
	//	flip
	gl_Position.xy = mix( vec2(-1,1), vec2(1,-1), gl_Position.xy );
	gl_Position.z = 0.0;
	gl_Position.w = 1.0;
}
`;

const NodeLineFrag = `
#version 100
precision highp float;
uniform vec2 LineStart;
uniform vec2 LineEnd;
varying vec2 LinePosition;
uniform float LineWidth;
uniform float LineDashed;

float TimeAlongLine2(vec2 Position,vec2 Start,vec2 End)
{
	vec2 Direction = End - Start;
	float DirectionLength = length(Direction);
	float Projection = dot( Position - Start, Direction) / (DirectionLength*DirectionLength);
	
	return Projection;
}

vec2 NearestToLine2(vec2 Position,vec2 Start,vec2 End)
{
	float Projection = TimeAlongLine2( Position, Start, End );
	
	//	past start
	Projection = max( 0.0, Projection );
	//	past end
	Projection = min( 1.0, Projection );
	
	//	is using lerp faster than
	//	Near = Start + (Direction * Projection);
	vec2 Near = mix( Start, End, Projection );
	return Near;
}

float DistanceToLine2(vec2 Position,vec2 Start,vec2 End)
{
	vec2 Near = NearestToLine2( Position, Start, End );
	return length( Near - Position );
}

float DistanceToLine()
{
	float Distance = DistanceToLine2( LinePosition, LineStart, LineEnd );
	Distance -= LineWidth;
	return Distance;
}


void main()
{
	float Distance = DistanceToLine();
	float Time = TimeAlongLine2( LinePosition, LineStart, LineEnd );
	
	float DashTime = fract( Time*10.0 );
	bool DashedAway = DashTime > 0.5; 

	if ( DashedAway )
		discard;

	if ( Distance > 0.0 )
	{
		gl_FragColor = vec4(1,0,0,1);
		discard;
		return;
	}
	gl_FragColor = vec4(0,1,0,1);
}
`;

export class Graph_t
{
	constructor()
	{
		this.Nodes = [];	//	in flow order
		this.LastIdentCounter = 3000;
	}
	
	CreateNode(Node)
	{
		//Node = Object.assign({},Node);
		
		this.LastIdentCounter++;
		Node.Ident = this.LastIdentCounter;
		
		Node.Inputs = Node.Inputs || [];
		Node.Outputs = Node.Outputs || [];
		
		this.Nodes.push(Node);
		this.OnNodesChanged();
		
		return Node;
	}
	
	GetNode(Ident)
	{
		return this.Nodes.find( n => n.Ident == Ident );
	}
	
	OnNodesChanged()
	{
		this.ConnectionsCache = null;
	}
	
	//	outputs array of 
	//	[Left(output).Node and .OutputIndex,
	//	right(input).Node and .InputIndex]
	GetConnections()
	{
		if ( this.ConnectionsCache )
			return this.ConnectionsCache;
			
		const Connections = [];
		for ( let OutputNode of this.Nodes )
		{
			for ( let InputNode of this.Nodes )
			{
				for ( let o=0;	o<OutputNode.Outputs.length;	o++ )
				{
					for ( let i=0;	i<InputNode.Inputs.length;	i++ )
					{
						const OutputName = OutputNode.Outputs[o];
						const InputName = InputNode.Inputs[i];
						if ( OutputName != InputName )
							continue;
						
						const Left = {};
						Left.Node = OutputNode;
						Left.OutputIndex = o;
						const Right = {};
						Right.Node = InputNode;
						Right.InputIndex = i;
						Connections.push([Left,Right]);
					}
				}
			}
		}
		this.ConnectionsCache = Connections;
		return Connections;
	}
	
	GetFlowConnectionNodes()
	{
		return [];
		const FlowPairs = [];
		for ( let n=1;	n<this.Nodes.length;	n++ )
		{
			const p = n-1;
			const Prev = this.Nodes[p];
			const Next = this.Nodes[n];
			FlowPairs.push( [Prev, Next] );
		}
		return FlowPairs;
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
		const Spacing = 10;
		const x = Index * (Width+Spacing);
		const y = 0;
		return [x,y,Width,Height];
	}

	GetLeftRect(Index)
	{
		const Pad = 2;
		const w = 1;
		const h = w;
		const x = this.Rect[0] - (w/2);
		const y = this.Rect[1] + Pad + (Index*(h+Pad));
		return [x,y,w,h];
	}
	
	GetRightRect(Index)
	{
		const Pad = 2;
		const w = 1;
		const h = w;
		const Right = this.Rect[2];
		const x = this.Rect[0] + Right - (w/2);
		const y = this.Rect[1] + Pad + (Index*(h+Pad));
		return [x,y,w,h];
	}
	
	GetFlowInputRect()
	{
		return this.GetLeftRect(0);
	}
	
	GetFlowOutputRect()
	{
		return this.GetRightRect(0);
	}
	
	GetInputRect(Index)
	{
		return this.GetLeftRect( Index+2 );
	}
	
	GetOutputRect(Index)
	{
		return this.GetRightRect( Index+2 );
	}
};

export default class GraphRenderer_t
{
	constructor()
	{
		this.Graph = new Graph_t();
		this.ScrollXy = [0,0];
		this.ZoomDivider = 1;
		
		this.NodeBoxes = {};	//	[Ident] = box
		
		this.BoxGeometry = null;
		this.BoxShader = null;
		this.LineGeometry = null;
		this.LineShader = null;
	}
	
	get ZoomMultiplier()
	{
		return 1.0 / this.ZoomDivider;
	}
	
	Zoom(Amount)
	{
		this.ZoomDivider -= Amount;
		if ( this.ZoomDivider < 0.1 )
			this.ZoomDivider = 0.1;
	}
	
	ScrollPx(Deltax,Deltay)
	{
		Deltax *= this.ZoomMultiplier;
		Deltay *= this.ZoomMultiplier;
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
		
		if ( !this.LineGeometry )
		{
			this.LineGeometry = this.BoxGeometry;
		}
		
		if ( !this.LineShader )
		{
			this.LineShader = await RenderContext.CreateShader( NodeLineVert, NodeLineFrag, null, ['TexCoord'] );
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
		ZoomedViewRect = GrowRect( ZoomedViewRect, this.ZoomMultiplier );
		
		const Commands = [];
		
		for ( let Box of Object.values(this.NodeBoxes) )
		{
			const Uniforms = {};
			Uniforms.Rect = GetNormalisedRect( Box.Rect, ZoomedViewRect );
			
			Commands.push(['Draw',this.BoxGeometry,this.BoxShader,Uniforms]);
		}
		
		const FlowConnectionNodes = this.Graph.GetFlowConnectionNodes();
		for ( let FlowConnection of FlowConnectionNodes )
		{
			const Box0 = this.GetNodeBox( FlowConnection[0] );
			const Box1 = this.GetNodeBox( FlowConnection[1] );
			const Rect0 = GetNormalisedRect( Box0.GetFlowOutputRect(), ZoomedViewRect );
			const Rect1 = GetNormalisedRect( Box1.GetFlowInputRect(), ZoomedViewRect );
			const StartPosition = GetRectCenter( Rect0 );
			const EndPosition = GetRectCenter( Rect1 );

			const LineWidth = Rect0[3];
			//const SizeNorm = GetNormalisedRect( [0,0,LineWidth,LineWidth], ZoomedViewRect ); 

			const Uniforms = {};
			Uniforms.LineStart = StartPosition;
			Uniforms.LineEnd = EndPosition;
			Uniforms.LineWidth = LineWidth;
			Uniforms.LineDashed = true;
			Commands.push(['Draw',this.LineGeometry,this.LineShader,Uniforms]);
		}
		
		const ConnectionNodes = this.Graph.GetConnections();
		for ( let Connection of ConnectionNodes )
		{
			const Box0 = this.GetNodeBox( Connection[0].Node );
			const Box1 = this.GetNodeBox( Connection[1].Node );
			const Rect0 = GetNormalisedRect( Box0.GetOutputRect(Connection[0].OutputIndex), ZoomedViewRect );
			const Rect1 = GetNormalisedRect( Box1.GetInputRect(Connection[1].InputIndex), ZoomedViewRect );
			const StartPosition = GetRectCenter( Rect0 );
			const EndPosition = GetRectCenter( Rect1 );

			const LineWidth = Rect0[3];
			//const SizeNorm = GetNormalisedRect( [0,0,LineWidth,LineWidth], ZoomedViewRect ); 

			const Uniforms = {};
			Uniforms.LineStart = StartPosition;
			Uniforms.LineEnd = EndPosition;
			Uniforms.LineWidth = LineWidth;
			Uniforms.LineDashed = true;
			Commands.push(['Draw',this.LineGeometry,this.LineShader,Uniforms]);
		}
		
		return Commands;
	}
}
