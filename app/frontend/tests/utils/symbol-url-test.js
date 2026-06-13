import { describe, it, expect } from 'frontend/tests/helpers/jasmine';
import rewriteBrokenSymbolUrl from '../../utils/symbol-url';

describe('symbol-url', function() {
  describe('rewriteBrokenSymbolUrl', function() {
    it('rewrites removed OpenSymbols arasaac/no_2.png to no.png', function() {
      var broken = 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/no_2.png';
      var cdn = 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/no_2.png';
      expect(rewriteBrokenSymbolUrl(broken)).toEqual('https://opensymbols.s3.amazonaws.com/libraries/arasaac/no.png');
      expect(rewriteBrokenSymbolUrl(cdn)).toEqual('https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/no.png');
    });

    it('leaves other urls unchanged', function() {
      var url = 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/happy.png';
      expect(rewriteBrokenSymbolUrl(url)).toEqual(url);
      expect(rewriteBrokenSymbolUrl(null)).toEqual(null);
      expect(rewriteBrokenSymbolUrl('')).toEqual('');
    });
  });
});
