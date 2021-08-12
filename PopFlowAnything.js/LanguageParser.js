//import {Language_Glsl,Language_CComments} from './Languages.js'
function EscapeRegexSymbol(Symbol)
{
	//	https://stackoverflow.com/a/3561711/355753
	//const Replaced = Symbol.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
	const Replaced = Symbol.replace(/[\\^$.|?*+()[{]/g, '\\$&');
	return Replaced;
}

export class Language_t
{
	GetOpenSectionSymbolsPattern()
	{
		let Symbols = this.GetOpenSectionSymbols();
		Symbols = Symbols.map(EscapeRegexSymbol);
		const Pattern = Symbols.join('|');
		return Pattern;
	}
	
	GetCloseSymbolPattern(OpeningSymbol)
	{
		let CloseSymbol = this.GetCloseSymbol(OpeningSymbol);
		if ( !CloseSymbol )
			return;
		return EscapeRegexSymbol(CloseSymbol);
	}
	
	AllowEofSection()
	{
		return false;
	}
	
	//	when this section is open, we ignore all others
	IsOpenTokenExclusive(OpenToken)
	{
		return false;
	}
	
	IsOpenTokenAllowedPrefix(OpenToken)
	{
		return true;
	}
}

//	todo: inherit from Language_CComments
export class Language_Glsl extends Language_t
{
	GetTokenPattern()
	{
		//	todo; symbols can't start with numbers
		return '[a-zA-Z0-9_;]+';
	}
	
	GetOpenSectionSymbols()
	{
		return [';','{','/*','//','#'];
	}
	
	GetCloseSymbol(OpeningSymbol)
	{
		const CloseSymbols = {};
		CloseSymbols[';'] = null;
		CloseSymbols['/*'] = '*/';
		CloseSymbols['//'] = '\n';
		CloseSymbols['{'] = '}';	//	maybe this function should return a pattern so we can do };? here for optional ;
		CloseSymbols['#'] = '\n';	//	maybe this function should return a pattern so we can do };? here for optional ;
		
		return CloseSymbols[OpeningSymbol];
	}
	
	IsOpenTokenExclusive(OpenToken)
	{
		switch(OpenToken)
		{
			case '/*':
			case '//':
				return true;
		}
		return false;
	}
	
	IsOpenTokenAllowedPrefix(OpenToken)
	{
		switch(OpenToken)
		{
			case '/*':
			case '//':
			case '#':
				return false;
		}
		return true;
	}
};

export class Language_CComments extends Language_t
{
	GetOpenSectionSymbols()
	{
		return ['/*','//'];
	}
	
	GetCloseSymbol(OpeningSymbol)
	{
		const CloseSymbols = {};
		CloseSymbols['/*'] = '*/';
		CloseSymbols['//'] = '\n';
		return CloseSymbols[OpeningSymbol];
	}
	
	AllowEofSection()
	{
		return true;
	}
	
	IsOpenTokenExclusive(OpenToken)
	{
		switch(OpenToken)
		{
			case '/*':
			case '//':
				return true;
		}
		return false;
	}
};


/*
	this now splits the source into a tree of sections, based on the language policy
*/
function SplitSections(Source,Language)
{
	const OriginalSource = Source;
	
	const Sections = [];

	let LastSectionIdent = 1000;
	function GetNewSectionIdent()
	{
		LastSectionIdent++;
		return LastSectionIdent;
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
		
		const OpenSectionKeywords = Language.GetOpenSectionSymbolsPattern();
		const OpenPattern = `(${OpenSectionKeywords})`;
		const OpenRegex = RegExp(OpenPattern,'g');	//	use 'g'lobal so we can find out where this string ended
		let OpenMatch = OpenRegex.exec(TailSource);
		
		//	make & match a close section if something is waiting to close
		const PendingSection = SectionStack.length ? SectionStack[SectionStack.length-1] : null;
		const ClosePattern = PendingSection ? Language.GetCloseSymbolPattern(PendingSection.OpenToken) : null;
		const CloseRegex = ClosePattern ? RegExp(`(${ClosePattern})`,'g') : null;
		let CloseMatch = CloseRegex ? CloseRegex.exec(TailSource) : null;

		//	pick whichever came first
		if ( OpenMatch && CloseMatch )
		{
			//	if the pending open is exclusive, ignore new opening
			//	todo: this is where we may need priority of exclusivity
			if ( Language.IsOpenTokenExclusive(PendingSection.OpenToken) )
			{
				OpenMatch = null;
			}
			else
			{
				if ( OpenMatch.index == CloseMatch.index )
					throw `Close and open matches at same position! ${TailSource.slice(OpenMatch.index,10)}`;
				if ( OpenMatch.index < CloseMatch.index )
					CloseMatch = null;
				else
					OpenMatch = null;
			}
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
				Section.Ident = GetNewSectionIdent();
				Section.SectionContent = Content.trim();
				//Section.OpenToken = OpenToken;
				Section.CloseToken = OpenToken;
				Sections.push(Section);
			
				SourcePos += OpenRegex.lastIndex;
				SourcePos -= WasReinsertedSource.length;
				continue;
			}
			
			//	has a close token, so add to the stack, and hopefully next iteration will find it
			const PendingSection = {};
			PendingSection.Ident = GetNewSectionIdent();
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

		//	found a close for the pending section
		if ( CloseMatch )
		{
			const Section = SectionStack.pop();	//PendingSection;
			delete Section.Open_LastIndex;		//	dont output this
			
			//	this section doesnt have prefixes, (eg. text before comment)
			//	so the prefix is part of the parent, so need to get put back into the parent, or if there isn't one, back in the source we're parsing...
			if ( !Language.IsOpenTokenAllowedPrefix(Section.OpenToken) )
			{
				const ReinsertMe = Section.Prefix;
				ReinsertedSource = ReinsertMe;
				Section.Prefix = '';
			}
			
			//Section.Prefix = Content.trim();	//	whitespace or prefix for the section
			Section.Prefix = Section.Prefix.trim();
			//Section.OpenToken = OpenToken;
			//Section.CloseToken = CloseToken;
			Section.SectionContent = TailSource.slice(0,CloseMatch.index);
			//	dont trim left in case the opening token doesnt allow whitespace (eg #define)
			Section.SectionContent = Section.SectionContent.trimEnd();
			
			Sections.push(Section);
			
			SourcePos += CloseRegex.lastIndex;
			SourcePos -= WasReinsertedSource.length;
		}

		//	this could be syntax error, or whitespace at the end
		if ( !OpenMatch && !CloseMatch )
		{
			//	gr: should always error if we have an pending section?
			if ( PendingSection )
				throw `Syntax error, reached EOF ${TailSource} but we still have a ${PendingSection.OpenToken} section still open`;
			
			//	just whitespace, clip it
			const TailWithoutWhitespace = TailSource.trim();
			if ( TailWithoutWhitespace.length == 0 )
				break;
				
			if ( !Language.AllowEofSection() )
				throw `Syntax error, reached EOF ${TailSource} without matching section`;
	
			const Section = {};
			Section.SectionContent = TailSource;
			Section.Type = 'Eof';
			Sections.push(Section);
			break;
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

	const CommentedSections = SplitSections( Source, new Language_CComments );
	
	const SourceSections = CommentedSections.map( GetSourceFromSection );
	const NoCommentSource = SourceSections.join('\n');
	return NoCommentSource;
}


export function ParseGlsl(Source)
{
	const Language = new Language_Glsl;
	const SectionTree = SplitSections(Source,Language);
	
	return SectionTree;
}

export default ParseGlsl;
