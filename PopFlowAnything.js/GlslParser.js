

//	gr: feels like we need a heirachy of "filters" for the code?
//	does this apply to other languages?
//		comment blocks	(could contain code+macros)
//		macros			(could contain code)
//		normal code

//	returns new source
//	EnumCommentBlock(CommentMeta)	.Start .End .Content
function StripComments(Source,EnumCommentBlock)
{
}



export default function Parse(Source)
{
	const OriginalSource = Source;
	
	const WhitespaceMaybe = `\\s*`;
	const Whitespace = `\\s`;
	const Token = `[a-zA-Z0-9_;]+`;
	//const OpenPattern = `^(${WhitespaceMaybe})(${Token})`;
	const OpenSectionKeywords = `;|{|/\\*`
	const OpenPattern = `(${OpenSectionKeywords})`;

	const CloseSectionKeywords = {};
	CloseSectionKeywords['{'] = '};?';
	CloseSectionKeywords['/*'] = '\\*/';

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
			break;
			
		const Content = TailSource.slice( 0, OpenMatch.index );
		const OpenToken = OpenMatch[1];
		const Out = {};
		Out.Content = Content.trim();
		Out.OpenToken = OpenToken;
		Out.CloseToken = CloseSectionKeywords[OpenToken];

		//	gotta find end of the section
		if ( Out.CloseToken )		
		{
			const ClosePattern = `(${Out.CloseToken})`;	//	todo: need to include opening comment block
			const CloseRegex = RegExp(ClosePattern,'g');
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

