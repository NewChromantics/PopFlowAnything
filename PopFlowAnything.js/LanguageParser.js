import {Language_Glsl,Language_CComments} from './Languages.js'


class IdentCounter_t
{
	constructor()
	{
		this.LastSectionIdent = 1000;
	}
	
	GetNewSectionIdent()
	{
		this.LastSectionIdent++;
		return this.LastSectionIdent;
	}
}


/*
	this now splits the source into a tree of sections, based on the language policy
*/
function SplitSections(Source,Language,RootOpenToken=null,AllowEof=null,IdentCounter)
{
	if ( AllowEof === null )
		AllowEof = Language.AllowEofSection();
	if ( !IdentCounter )
		IdentCounter = new IdentCounter_t;
		
	//	maybe a better way to do this than just inserting code
	//Source += Language.GetBuiltInSections().join('\n');

	const OriginalSource = Source;
	
	const Sections = [];


	function ProcessPrefix(Section,Content,OpenToken)
	{
		const AllowChildEof = true;	//	we want to capture if there were no children, ie. just a single statement with no ;
		const Children = SplitSections( Content, Language, OpenToken, AllowChildEof, IdentCounter );
		
		//	happens when content is ""	
		if ( Children.length == 0 )
		{
			//throw `Should this ever have no children?`;
		}
		else if ( Children[Children.length-1].Type == 'Eof' )
		{
			const JustText = Children.pop();
			Section.SectionContent = JustText.SectionContent.trim();
		}
		else
		{
			//	children have replaced content?
			delete Section.SectionContent;
		}
				
		if ( Children.length )
			Section.Children = Children;
	}


	let SourcePos = 0;
	
	//	some sections can open inside other sections
	//	eg. { { /*
	//	look for open, and close if stack isn't empty
	//	if we find open, open and add to stack (dont search for close here)
	//	if we find close, close previous
	let SectionStack = [];
	
	//	if something interrupts the parent section (or general source) we re-search
	//	it's prefix (if it doesn't use it) so it can be captured in previous
	//		function before {}		uses prefix
	//		/* */					reinserts prefix
	//	this currently breaks the order, as the prefix should really come first (and the interruptor should be a child of it)
	let ReinsertedSource = '';
	
	for ( let i=0;	i<1000;	i++ )
	{
		const WasReinsertedSource = ReinsertedSource;
		const TailSource = WasReinsertedSource + OriginalSource.slice(SourcePos);
		ReinsertedSource = '';
		
		const PendingSection = SectionStack.length ? SectionStack[SectionStack.length-1] : null;
		const PendingOpenToken = PendingSection ? (PendingSection.OpenToken||PendingSection.OperatorToken) : RootOpenToken;
		const PendingOperatorSection = (PendingSection && PendingSection.OperatorToken) ? PendingSection : null;

		const OpenSectionKeywords = Language.GetOpenSectionSymbolsPattern( PendingOpenToken );
		const OpenPattern = OpenSectionKeywords ? `(${OpenSectionKeywords})` : null;
		const OpenRegex = OpenPattern ? RegExp(OpenPattern,'g') : null;	//	use 'g'lobal so we can find out where this string ended
		let OpenMatch = OpenRegex ? OpenRegex.exec(TailSource) : null;
		
		//	make & match a close section if something is waiting to close
		const ClosePattern = PendingSection ? Language.GetCloseSymbolPattern(PendingOpenToken) : null;
		let CloseRegex = ClosePattern ? RegExp(`(${ClosePattern})`,'g') : null;
		let CloseMatch = CloseRegex ? CloseRegex.exec(TailSource) : null;

		//	gr: I tried to do operators as open sections like ; but too fiddly to fit
		//		trying explicitly splitting stuff in half
		const OperatorKeywords = Language.GetOperatorSymbolsPattern( PendingOpenToken );
		const OperatorPattern = OperatorKeywords ? `(${OperatorKeywords})` : null;
		const OperatorRegex = OperatorPattern ? RegExp(OperatorPattern,'g') : null;	//	use 'g'lobal so we can find out where this string ended
		let OperatorMatch = OperatorRegex ? OperatorRegex.exec(TailSource) : null;

		//	if we're in an operator, it can be closed, if we hit the close of the next non-operator's parent close
		//	eg. ( A + B <here> )
		let OperatorParentCloseRegex = null;
		let OperatorParentCloseMatch = null;
		if ( PendingOperatorSection )
		{
			const PendingNonOperators = SectionStack.filter( s => !s.OperatorToken );
			const PendingOpenTokens = PendingNonOperators.map( Section => Section.OpenToken );
			//	the root token, if there is one, could also be non-operator
			//	gr: this might be an operator though?
			if ( RootOpenToken )
				PendingOpenTokens.unshift(RootOpenToken);
			const PendingOperatorParentOpenToken = PendingOpenTokens.pop();
			if ( PendingOperatorParentOpenToken )
			{
				const ParentClosePattern = Language.GetCloseSymbolPattern(PendingOperatorParentOpenToken);
				OperatorParentCloseRegex = ParentClosePattern ? RegExp(`(${ParentClosePattern})`,'g') : null;
				OperatorParentCloseMatch = OperatorParentCloseRegex ? OperatorParentCloseRegex.exec(TailSource) : null;
			}
		}
		
		
		let Matches = [OpenMatch,CloseMatch,OperatorMatch,OperatorParentCloseMatch].filter( m => m!=null );
		
		//	hack for now
		//	if we've reached EOF (no matches), but have a pending operator, we close up the operator
		if ( Matches.length == 0 && PendingSection && PendingSection.OperatorToken )
		{
			CloseMatch = {};
			CloseMatch.index = TailSource.length;
			Matches.push(CloseMatch);
			
			CloseRegex = {};
			CloseRegex.lastIndex = TailSource.length;
		}
		
		
		//	this could be syntax error, or whitespace at the end
		if ( Matches.length == 0 )
		{
			//	gr: should always error if we have an pending section?
			if ( PendingSection )
				throw `Syntax error, reached EOF ${TailSource} but we still have a ${PendingSection.OpenToken} section still open`;
			
			//	just whitespace, clip it
			const TailWithoutWhitespace = TailSource.trim();
			if ( TailWithoutWhitespace.length == 0 )
				break;
				
			if ( !AllowEof )
				throw `Syntax error, reached EOF ${TailSource} without matching section`;
	
			const Section = {};
			Section.SectionContent = TailSource;
			Section.Type = 'Eof';
			Sections.push(Section);
			break;
		}
		
		//	pick whichever came first
		function CompareIndex(a,b)
		{	//	just do -1 and 1, if any indexes match... we may have a problem
			return ( a.index < b.index ) ? -1 : 1;
		}
		Matches = Matches.sort( CompareIndex );
		OpenMatch = (Matches[0] == OpenMatch) ? OpenMatch : null;
		CloseMatch = (Matches[0] == CloseMatch) ? CloseMatch : null;
		OperatorMatch = (Matches[0] == OperatorMatch) ? OperatorMatch : null;
		
		//	found operator, need to split left & right, but we want them as 2 children...
		//	so push an operator, then wait for the end
		//	but what is the end, this can only work inside a child section where we expect the operator to get left over?
		if ( OperatorMatch )
		{
			const Content = TailSource.slice( 0, OperatorMatch.index );
			const OperatorToken = OperatorMatch[1];
			const CloseToken = Language.GetCloseSymbol(OperatorToken);
			
			//	has a close token, so add to the stack, and hopefully next iteration will find it
			const PendingSection = {};
			PendingSection.Ident = IdentCounter.GetNewSectionIdent();
			PendingSection.ParentIdent = SectionStack.length ? SectionStack[SectionStack.length-1].Ident : null;
			PendingSection.Operator_LastIndex = OperatorRegex.lastIndex;
			PendingSection.OperatorToken = OperatorToken;
			PendingSection.OperatorFunction = Language.GetOperatorFunction(OperatorToken);
			PendingSection.CloseToken = CloseToken;
			PendingSection.Prefix = Content;	//	.trim?
			SectionStack.push(PendingSection);
		
			SourcePos += OperatorRegex.lastIndex;
			SourcePos -= WasReinsertedSource.length;
			continue;
		}
		
		
		//	found another opening before a close
		if ( OpenMatch )
		{
			const Content = TailSource.slice( 0, OpenMatch.index );
			const OpenToken = OpenMatch[1];
			const CloseToken = Language.GetCloseSymbol(OpenToken);
		
			//	auto-closing section
			if ( !CloseToken )
			{
				const Section = {};
				Section.ParentIdent = SectionStack.length ? SectionStack[SectionStack.length-1].Ident : null;
				Section.Ident = IdentCounter.GetNewSectionIdent();
				//Section.OpenToken = OpenToken;
				Section.CloseToken = OpenToken;
				ProcessPrefix(Section,Content,OpenToken);
				Sections.push(Section);
			
				SourcePos += OpenRegex.lastIndex;
				SourcePos -= WasReinsertedSource.length;
				continue;
			}
			
			//	has a close token, so add to the stack, and hopefully next iteration will find it
			const PendingSection = {};
			PendingSection.Ident = IdentCounter.GetNewSectionIdent();
			PendingSection.ParentIdent = SectionStack.length ? SectionStack[SectionStack.length-1].Ident : null;
			PendingSection.Open_LastIndex = OpenRegex.lastIndex;
			PendingSection.OpenToken = OpenToken;
			PendingSection.CloseToken = CloseToken;
			PendingSection.Prefix = Content;	//	.trim?
			SectionStack.push(PendingSection);
		
			SourcePos += OpenRegex.lastIndex;
			SourcePos -= WasReinsertedSource.length;
			continue;
		}
		
		if ( OperatorParentCloseMatch )
		{
			//	close the current operator, but leave things in current state so we will re-process here until we hit the operator parent
			//throw `Close operator`;
			CloseMatch = OperatorParentCloseMatch;
		}

		//	found a close for the pending section
		if ( CloseMatch || OperatorParentCloseMatch )
		{
			const Section = SectionStack.pop();	//PendingSection;
			delete Section.Open_LastIndex;		//	dont output this
			
			//	this section doesnt have prefixes, (eg. text before comment)
			//	so the prefix is part of the parent, so need to get put back into the parent, or if there isn't one, back in the source we're parsing...
			if ( !Language.IsOpenTokenAllowedPrefix(Section.OpenToken) )
			{
				const ReinsertMe = Section.Prefix;
				ReinsertedSource = ReinsertMe;
				Section.Prefix = null;
			}
			
			if ( Section.Prefix )
			{
				Section.Prefix = Section.Prefix.trim();
				if ( !Section.Prefix.length )
					Section.Prefix = null;
			}
			
			//Section.OpenToken = OpenToken;
			//Section.CloseToken = CloseToken;
			Section.SectionContent = TailSource.slice(0,CloseMatch.index);
			//	dont trim left in case the opening token doesnt allow whitespace (eg #define)
			Section.SectionContent = Section.SectionContent.trimEnd();

			//	actual is processing suffix (at least, for operator)
			const ParentToken = Section.OpenToken || Section.OperatorToken;
			ProcessPrefix(Section,Section.SectionContent,ParentToken);
			
			
			Sections.push(Section);
			
			if ( OperatorParentCloseMatch )
			{
				//	dont move source along, we need to re-process here
				//	gr: need to move over the content up to the close, as that's swallowed into Section.SectionContent
				SourcePos += CloseMatch.index;
			}
			else
			{
				SourcePos += CloseRegex.lastIndex;
				SourcePos -= WasReinsertedSource.length;
			}
		}

	}
	
	if ( SectionStack.length )
		throw `Leftover section stack, shouldn't happen?`;
	
	//	turn into a tree (at least, move children into their parents, so sections becomes root nodes)
	function GetSection(Ident)
	{
		function FindInChildren(Section)
		{
			if ( !Section.Children )
				return null;
			
			return FindInArray(Section.Children);
		}
		
		function FindInArray(SectionList)
		{
			for ( let Section of SectionList )
			{
				if ( Section.Ident == Ident )
					return Section;
				//	check children
				const ChildMatch = FindInChildren(Section);
				if ( ChildMatch )
					return ChildMatch;
			}
			return null;
		}		
		
		const Match = FindInArray(Sections);
		if ( Match )
			return Match;
		throw `Failed to find section with ident ${Ident}, but it must exist`;
	}
	
	//	work backwards for array safety
	for ( let i=Sections.length-1;	i>=0;	i-- )
	{
		const Section = Sections[i];
		
		//	is root
		if ( !Section.ParentIdent )
			continue;
		
		//	move into parent
		const Parent = GetSection(Section.ParentIdent);
		Parent.Children = Parent.Children || [];
		//	gr: INSERT at the start as we're iterating backwards and pushing means earlier entries go at the back
		Parent.Children.unshift(Section);
		//	remove from root sections
		Sections.splice(i,1);
	}
		
	
	return Sections;
}

//	returns new source
//	gr: no longer needed, but left as an example
export function StripComments(Source)
{
	function GetSourceFromSection(CommentSection)
	{
		if ( CommentSection.Type == 'Eof' )
			return CommentSection.SectionContent;
		return CommentSection.Prefix;
	}

	const CommentedSections = SplitSections( Source, new Language_CComments, IdentCounter );
	
	const SourceSections = CommentedSections.map( GetSourceFromSection );
	const NoCommentSource = SourceSections.join('\n');
	return NoCommentSource;
}


export function ParseGlsl(Source)
{
	const Language = new Language_Glsl;
	let SectionTree = SplitSections(Source,Language);
	SectionTree = SectionTree.map(ConvertSectionToType);
	
	function SectionFunctionsToFlowNodes(Section)
	{
		if ( Section instanceof SectionFunction_t )
		{
			return SectionTreeToFlowNodes(SectionTree,Section.FunctionName);
		}
		/*
		//	otuput variable declarations
		if ( Section instanceof SectionEmptyStatement_t )
		{
			return Section.SectionContent;
		}
		*/
	}
	
	//	rebuild code to show we can iterate through
	let NodeGroups = SectionTree.map(SectionFunctionsToFlowNodes);
	NodeGroups = NodeGroups.filter( n => n!=null );
	return NodeGroups;
}


class Section_t
{
	constructor(Section)
	{
		Object.assign(this,Section);
	}
	
	get VariableName()
	{
		return `var_${this.Ident}`;
	}
	
	get ConstName()
	{
		return `const_${this.Ident}`;
	}
}

class SectionCall_t extends Section_t
{
	constructor(Section)
	{
		super(Section);
	}
	
	static Match(Section)
	{
		if ( Section.OpenToken != '(' )
			return false;
		//	must have function name
		if ( !Section.Prefix )
			return false;
		return true;
	}	
}

class SectionComment_t extends Section_t
{
	constructor(Section)
	{
		super(Section);
	}
	
	static Match(Section)
	{
		return (Section.OpenToken == '//' || Section.OpenToken == '/*');
	}	
}

class SectionOperator_t extends Section_t
{
	constructor(Section)
	{
		super(Section);
	}
	
	static Match(Section)
	{
		return (Section.OperatorToken!=null);
	}
}


class SectionAssignmentOperator_t extends SectionOperator_t
{
	constructor(Section)
	{
		super(Section);
	}
	
	get VariableName()
	{
		if ( this.OperatorToken == 'return' )
			return this.OperatorToken;
		return `var_${this.Prefix}`;
	}
	
	static Match(Section)
	{
		if ( !super.Match(Section) )
			return false;
		//	if two children, left and right, then not assignment
		if ( Section.OperatorToken == 'return' )
			return true;
		if ( !Section.Prefix )
			return false;
		return true;
	}	
}


class SectionStatement_t extends Section_t
{
	constructor(Section)
	{
		super(Section);
	}
	
	static Match(Section)
	{
		if ( Section.CloseToken != ';' )
			return false;
		if ( !Section.Children || Section.Children.length == 0 )
			return false;
		return true;
	}	
}


class SectionScoping_t extends Section_t
{
	constructor(Section)
	{
		super(Section);
	}
	
	static Match(Section)
	{
		if ( Section.OpenToken != '(' )
			return false;
		//	no function name
		if ( Section.Prefix )
			return false;
		return true;
	}	
}

class SectionEmptyStatement_t extends Section_t
{
	constructor(Section)
	{
		super(Section);
	}
	
	static Match(Section)
	{
		if ( Section.CloseToken == ';' )
			if ( !Section.Children || Section.Children.length==0 )
				return true;
		return false;
	}	
}

class SectionFunction_t extends Section_t
{
	constructor(Section)
	{
		super(Section);
		
		function CleanArgument(Argument)
		{
			Argument = Argument.trim();
			Argument = Argument.replace(' ','');
			return Argument;
		}
		
		const PreSymbol = `[\\s\\S]*?`;
		const Symbol = `[A-Za-z0-9_]+`
		const OpenBracket = `\\(`;
		const CloseBracket = `\\)`;
		const Pattern = new RegExp(`(${PreSymbol})(${Symbol})${OpenBracket}(.*)${CloseBracket}`);
		const FunctionMatch = Section.Prefix.match(Pattern);
		this.ReturnTypes = FunctionMatch[1];
		this.FunctionName = FunctionMatch[2];
		this.Arguments = FunctionMatch[3].split(',');
		this.Arguments = this.Arguments.map( CleanArgument );
	}
	
	get VariableName()
	{
		return `var_${this.FunctionName}_return`;
	}
	
	GetArgumentVariableName(ArgumentName)
	{
		return `var_${this.FunctionName}_${ArgumentName}`;
	}
	
	static Match(Section)
	{
		return (Section.OpenToken == '{');
		const Pattern = `.*\((.*\)$`;
		return Section.Prefix.match(Pattern);
	}
}

function ConvertSectionToType(Section)
{
	//	already converted
	if ( Section instanceof Section_t )
		return Section;
		
	if ( SectionFunction_t.Match(Section) )	return new SectionFunction_t(Section);
	if ( SectionComment_t.Match(Section) )	return new SectionComment_t(Section);
	if ( SectionCall_t.Match(Section) )		return new SectionCall_t(Section);
	if ( SectionAssignmentOperator_t.Match(Section) )	return new SectionAssignmentOperator_t(Section);
	if ( SectionOperator_t.Match(Section) )	return new SectionOperator_t(Section);
	if ( SectionStatement_t.Match(Section) )	return new SectionStatement_t(Section);
	if ( SectionScoping_t.Match(Section) )	return new SectionScoping_t(Section);	
	if ( SectionEmptyStatement_t.Match(Section) )	return new SectionEmptyStatement_t(Section);
	return new Section_t(Section);
}


class Node_t
{
}



//	variable declaration
class NodeVariableDeclaration_t extends Node_t
{
	constructor(VariableName)
	{
		super();
		this.Outputs = [VariableName];
	}
	
	GetCode()
	{
		return `var ${this.Output};`;
	}
}

//	gr: turn this into a simple entry node with multiple outputs
class NodeEntry_t extends Node_t
{
	constructor(OutputVariables)
	{
		super();
		this.Outputs = OutputVariables;
	}
	
	GetCode()
	{
		return `--> entry( ${this.Outputs} )`;
	}
}

//	set variable to variable
class NodeVariableSet_t extends Node_t
{
	constructor(VariableName,RightVariable)
	{
		super();
		this.Input = RightVariable;
		this.Outputs = [VariableName];
	}
	
	GetCode()
	{
		return `${this.Outputs[0]} = ${this.Input};`;
	}
}

//	function call
class NodeFunctionCall_t extends Node_t
{
	constructor(FunctionName,Arguments,OutputVariableName)
	{
		super();
		this.FunctionName = FunctionName;
		this.Inputs = Arguments;
		this.Outputs = [OutputVariableName];
	}
		
	GetCode()
	{
		return `${this.Outputs[0]} = ${this.FunctionName}( ${this.Inputs} );`;
	}
}



function SectionToFlowNodes(Section,PreviousOperatorVariable)
{
	const Nodes = [];
	function PushNode(Node)
	{
		if ( Node instanceof NodeVariableDeclaration_t )
			return;
		Nodes.push(Node);
	}

	//	encapsulating code for code generation
	if ( Section instanceof SectionFunction_t )
	{
		//PushCode(`${Section.Prefix} ${Section.OpenToken}`);
		//	need to declare args as new scoped variables
		//	todo: running scoped vars!
		//	todo: split args, multiple vars
		PushNode( new NodeEntry_t(Section.Arguments) );
		
		for ( let Argument of Section.Arguments )
		{
			const VariableName = Section.GetArgumentVariableName(Argument);
			PushNode( new NodeVariableDeclaration_t(VariableName) );
			PushNode( new NodeVariableSet_t( VariableName, Argument ) );
		}
		//let Line = `${Section.VariableName} = ${Section.Arguments};`;
		//PushCode(Line);
	}


	let LastChildVariable = null;
	let FirstChildVariable = null;
	for ( let Child of Section.Children||[] )
	{
		Child = ConvertSectionToType(Child);
	
		if ( Child instanceof SectionComment_t )
			continue;
		
		if ( Child instanceof SectionEmptyStatement_t )
			continue;
		
		FirstChildVariable = FirstChildVariable || Child.VariableName;
		const ChildNodes = SectionToFlowNodes( Child, LastChildVariable );
		//PushCode(`${Child.VariableName}=`);
		
		ChildNodes.forEach( PushNode );
		/*
		if ( Child instanceof SectionOperator_t )
		{
			PushCode(`${LastChildVariable} ${Child.OperatorToken}`);
		}
		*/
		//	this should only get set if this child was evaluated and outputs a variable (or const!)
		LastChildVariable = Child.VariableName || Child.ConstName;
	}

	//	suffix code
	if ( Section instanceof SectionOperator_t )
	{
		//	section content is a literal... we should split that into its own variable
		const LiteralVariableName = `${Section.ConstName}`;
		if ( !LastChildVariable )
		{
			LastChildVariable = LiteralVariableName;
			PushNode( new NodeVariableDeclaration_t( LiteralVariableName ) );
			PushNode( new NodeVariableSet_t( LiteralVariableName, Section.SectionContent ) );
			//PushCode(`${LiteralVariableName} = ${Section.SectionContent}`);
		}
		
		let Left;
		const Right = LastChildVariable;
		
		if ( Section instanceof SectionAssignmentOperator_t )
		{
			Left = Section.VariableName;
		}
		else
		{
			//	shouldn't be empty if this is an operator
			Left = PreviousOperatorVariable;
		}
		
		const OperatorFunction = Section.OperatorFunction;
		const FunctionArguments = [Left,Right];
		
		PushNode( new NodeFunctionCall_t( OperatorFunction, FunctionArguments, Section.VariableName ) );
		
		//let Line = `${Section.VariableName} = `;
		//Line += `${OperatorFunction}( ${Left}, ${Right} )`
		//PushCode(Line);
	}
	else if ( Section instanceof SectionFunction_t )
	{
		//	here, we've reached the end of the functin, all child statements ran, and last in the statements
		//	is the output
		//	todo: the last should be a return operator!
		//PushCode(`${Section.FunctionName}() returns ${LastChildVariable}`);
		PushNode( new NodeVariableDeclaration_t( Section.VariableName ) );
		PushNode( new NodeVariableSet_t( Section.VariableName, LastChildVariable ) );
	}
	else if ( Section instanceof SectionCall_t )
	{
		PushNode( new NodeVariableDeclaration_t( Section.VariableName ) );
		if ( LastChildVariable )
			PushNode( new NodeFunctionCall_t( Section.Prefix, LastChildVariable, Section.VariableName ) );
		else
			PushNode( new NodeFunctionCall_t( Section.Prefix, Section.SectionContent, Section.VariableName ) );
	}
	else if ( Section instanceof SectionStatement_t || Section instanceof SectionScoping_t )
	{
		//	children have all executed, resulting a variable
		PushNode( new NodeVariableDeclaration_t( Section.VariableName ) );
		PushNode( new NodeVariableSet_t( Section.VariableName, LastChildVariable ) );
	}
	else
	{
		throw `What is this`;
		let Line = `${Section.VariableName} = `;
		Line += Section.Prefix || '';
		Line += Section.OpenToken||'';
		Line += Section.OperatorToken||'';
		Line += Section.SectionContent||'';
		if ( LastChildVariable )
			Line += ` ${LastChildVariable}`;
		Line += Section.CloseToken||'';
		//if ( FirstChildVariable )	Line += ` (FirstChildVariable=${FirstChildVariable})`;
		//if ( LastChildVariable )	Line += ` (LastChildVariable=${LastChildVariable})`;
		PushCode(Line);
	}
		
	return Nodes;
}


function SectionTreeToFlowNodes(SectionTree,EntryFunction)
{
	//	first find the entry section (which must be a global, so is a root node)
	SectionTree = SectionTree.map(ConvertSectionToType);
	
	const EntrySection = SectionTree.find( s => s.FunctionName == EntryFunction );
	if ( !EntrySection )
		throw `Failed to find entry function ${EntryFunction}`;
	
	const Nodes = SectionToFlowNodes(EntrySection);
	return Nodes;
}





export default ParseGlsl;
