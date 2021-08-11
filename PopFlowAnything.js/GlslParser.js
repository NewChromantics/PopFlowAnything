

//	gr: feels like we need a heirachy of "filters" for the code?
//	does this apply to other languages?
//		comment blocks	(could contain code+macros)
//		macros			(could contain code)
//		normal code



function EscapeRegexSymbol(Symbol)
{
	//	https://stackoverflow.com/a/3561711/355753
	//const Replaced = Symbol.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
	const Replaced = Symbol.replace(/[\\^$.|?*+()[{]/g, '\\$&');
	return Replaced;
}

class Language_t
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

}

class Language_Glsl extends Language_t
{
	GetTokenPattern()
	{
		//	todo; symbols can't start with numbers
		return '[a-zA-Z0-9_;]+';
	}
	
	GetOpenSectionSymbols()
	{
		return [';','{','/*'];
	}
	
	GetCloseSymbol(OpeningSymbol)
	{
		const CloseSymbols = {};
		CloseSymbols[';'] = null;
		CloseSymbols['/*'] = '*/';
		CloseSymbols['//'] = '\n';
		CloseSymbols['{'] = '}';	//	maybe this function should return a pattern so we can do };? here for optional ;
		return CloseSymbols[OpeningSymbol];
	}
};

class Language_CComments extends Language_t
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
};


function SplitSections(Source,Language)
{
	const OriginalSource = Source;
	
	const WhitespaceMaybe = `\\s*`;
	const Whitespace = `\\s`;
	//const Token = Language.GetTokenPattern();
	//const OpenPattern = `^(${WhitespaceMaybe})(${Token})`;
	const OpenSectionKeywords = Language.GetOpenSectionSymbolsPattern();	//	`;|{|/\\*`
	const OpenPattern = `(${OpenSectionKeywords})`;

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
	
	for ( let i=0;	i<1000;	i++ )
	{
		const TailSource = OriginalSource.slice(SourcePos);
		//console.log(`Searching ${TailSource}`);
		
		//	look for a new opening 
		//	todo: not all opens are allowed inside some sections; eg ignore { inside /*
		const OpenRegex = RegExp(OpenPattern,'g');	//	use 'g'lobal so we can find out where this string ended
		let OpenMatch = OpenRegex.exec(TailSource);
		
		const PendingSection = SectionStack.length ? SectionStack[SectionStack.length-1] : null;
		const ClosePattern = PendingSection ? Language.GetCloseSymbolPattern(PendingSection.OpenToken) : null;
		const CloseRegex = ClosePattern ? RegExp(`(${ClosePattern})`,'g') : null;
		let CloseMatch = CloseRegex ? CloseRegex.exec(TailSource) : null;

		//	pick whichever came first
		if ( OpenMatch && CloseMatch )
		{
			if ( OpenMatch.index == CloseMatch.index )
				throw `Close and open matches at same position! ${TailSource.slice(OpenMatch.index,10)}`;
			if ( OpenMatch.index < CloseMatch.index )
				CloseMatch = null;
			else
				OpenMatch = null;
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
				Section.Ident = GetNewSectionIdent();
				Section.Indent = SectionStack.length;
				Section.SectionContent = Content.trim();
				//Section.OpenToken = OpenToken;
				Section.CloseToken = OpenToken;
				Sections.push(Section);
			
				SourcePos += OpenRegex.lastIndex;
				continue;
			}
			
			//	has a close token, so add to the stack, and hopefully next iteration will find it
			const PendingSection = {};
			PendingSection.Ident = GetNewSectionIdent();
			PendingSection.ParentIdent = SectionStack.length ? SectionStack[SectionStack.length-1].Ident : null;
			PendingSection.Indent = SectionStack.length;
			PendingSection.Open_LastIndex = OpenRegex.lastIndex;
			PendingSection.OpenToken = OpenToken;
			PendingSection.CloseToken = CloseToken;
			PendingSection.Prefix = Content;	//	.trim?
			SectionStack.push(PendingSection);
			
			SourcePos += OpenRegex.lastIndex;
			continue;
		}

		//	found a close for the pending section
		if ( CloseMatch )
		{
			const Section = SectionStack.pop();	//PendingSection;
			delete Section.Open_LastIndex;		//	dont output this
			//Section.Prefix = Content.trim();	//	whitespace or prefix for the section
			Section.Prefix = Section.Prefix.trim();
			//Section.OpenToken = OpenToken;
			//Section.CloseToken = CloseToken;
			Section.SectionContent = TailSource.slice(0,CloseMatch.index);
			Section.SectionContent = Section.SectionContent.trim();
			
			Sections.push(Section);
			
			SourcePos += CloseRegex.lastIndex;
		}

		//	this could be syntax error, or whitespace at the end
		if ( !OpenMatch && !CloseMatch )
		{
			//	gr: should error if we have an pending section?
			if ( PendingSection )
				throw `Syntax error, reached EOF ${TailSource} without matching an open section`;
			
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
	
	return Sections;
}

//	returns new source
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


export default function Parse(Source)
{
	//	gr: feel like we need a heirachical approach
	//		where we split into comment sections, then macro sections, then parse the remaining sections
	//	but MVP, remove comment blocks which can break parsing
	//Source = StripComments(Source);
	
	const Language = new Language_Glsl;
	const Sections = SplitSections(Source,Language);
	
	return Sections;
}

