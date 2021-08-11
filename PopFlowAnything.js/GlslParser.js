

//	gr: feels like we need a heirachy of "filters" for the code?
//	does this apply to other languages?
//		comment blocks	(could contain code+macros)
//		macros			(could contain code)
//		normal code

//	returns new source
//	EnumCommentBlock(CommentMeta)	.Start .End .Content
function StripSections(Source,EnumSectionBlock)
{
}

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
};


function ParseSections(Source,Language)
{
	const OriginalSource = Source;
	
	const WhitespaceMaybe = `\\s*`;
	const Whitespace = `\\s`;
	const Token = Language.GetTokenPattern();
	//const OpenPattern = `^(${WhitespaceMaybe})(${Token})`;
	const OpenSectionKeywords = Language.GetOpenSectionSymbolsPattern();	//	`;|{|/\\*`
	const OpenPattern = `(${OpenSectionKeywords})`;

	const Tokens = [];

	let SourcePos = 0;
	for ( let i=0;	i<1000;	i++ )
	{
		const TailSource = OriginalSource.slice(SourcePos);
		//	use 'g'lobal so we can find out where this string ended
		const OpenRegex = RegExp(OpenPattern,'g');
		console.log(`Searching ${TailSource}`);
		const OpenMatch = OpenRegex.exec(TailSource);
		if ( !OpenMatch )
		{
			//	this could be syntax error, or whitespace
			const TailWithoutWhitespace = TailSource.trim();
			if ( TailWithoutWhitespace.length == 0 )
				break;
			throw `Syntax error, reached EOF ${TailSource} without sections`;
			const Out = {};
			Out.Content = TailSource;
			Out.Type = 'Eof';
			Tokens.push(Out);
			break;
		}
			
		const Content = TailSource.slice( 0, OpenMatch.index );
		const OpenToken = OpenMatch[1];
		const Out = {};
		Out.Content = Content.trim();
		Out.OpenToken = OpenToken;
		Out.CloseToken = Language.GetCloseSymbol(OpenToken);

		//	gotta find end of the section
		if ( Out.CloseToken )		
		{
			const ClosePattern = Language.GetCloseSymbolPattern(OpenToken);
			const CloseRegex = RegExp(`(${ClosePattern})`,'g');
			//const InsideSource = TailSource.slice( OpenMatch.index );
			const InsideSource = TailSource.slice( OpenRegex.lastIndex );	//	dont include open chars
			console.log(`Searching section ${InsideSource}`);
			const CloseMatch = CloseRegex.exec(InsideSource);
			if ( !CloseMatch )
				throw `Failed to find closing token for ${Out.OpenToken}`;
			//Out.SectionContent = InsideSource.slice(0,CloseRegex.lastIndex);
			Out.SectionContent = InsideSource.slice(0,CloseMatch.index);	//	dont include closing chars
			
			SourcePos += OpenRegex.lastIndex;	//	start of InsideSource
			SourcePos += CloseRegex.lastIndex;	//	end of InsideSource
		}
		else
		{
			SourcePos += OpenRegex.lastIndex;
		}
		
		Tokens.push(Out);
	}
	
	return Tokens;
}


export default function Parse(Source)
{
	const Language = new Language_Glsl;
	const Sections = ParseSections(Source,Language);
	
	return Sections;
}

