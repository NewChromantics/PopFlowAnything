function EscapeRegexSymbol(Symbol)
{
	//	https://stackoverflow.com/a/3561711/355753
	//const Replaced = Symbol.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
	const Replaced = Symbol.replace(/[\\^$.|?*+()[{]/g, '\\$&');
	return Replaced;
}

export default class Language_t
{
	GetOpenSectionSymbolsPattern(ParentOpeningSymbol)
	{
		let Symbols = this.GetOpenSectionSymbols(...arguments);
		if ( !Symbols.length )
			return null;
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
	
	IsOpenTokenAllowedPrefix(OpenToken)
	{
		return true;
	}
	
	GetBuiltInSections()
	{
		return [];
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
	
	GetOpenSectionSymbols(ParentOpeningSymbol)
	{
		//	nothing opens inside comment block
		if ( ParentOpeningSymbol == '/*' )
			return [];
		//	gr: do we allow /* after // ?
		if ( ParentOpeningSymbol == '//' )
			return [];
		
		let OpenSections = [';','{','/*','//','#'];

		//	only evaluate () inside a single line
		if ( ParentOpeningSymbol == ';' )
		{
			OpenSections.push('(');
		}
		
		return OpenSections;
	}
	
	GetOperators()
	{
		//	todo: map operators to function names?
		const Operators = 
		[
			//	right or left only?
			//'.',	//	split every . for swizzling
			//'!'
			
			//	left & right side operators
			'=',
			'+=','-=','/=','*=','!=',
			'+','-','/','*',
			'&&','||',
		];
		return Operators;
	}
	
	GetCloseSymbol(OpeningSymbol)
	{
		const CloseSymbols = {};
		CloseSymbols[';'] = null;
		CloseSymbols['/*'] = '*/';
		CloseSymbols['//'] = '\n';
		CloseSymbols['{'] = '}';	//	maybe this function should return a pattern so we can do };? here for optional ;
		CloseSymbols['#'] = '\n';	//	maybe this function should return a pattern so we can do };? here for optional ;
		CloseSymbols['('] = ')';
		
		return CloseSymbols[OpeningSymbol];
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
	
	GetBuiltInSections()
	{
		const Builtins = [
		`out vec4 gl_fragcolor;`
		];
		return Builtins;
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
	
};
