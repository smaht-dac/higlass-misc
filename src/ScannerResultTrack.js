import LegendUtils from './legend-utils';

import { scaleScalableGraphics } from './misc-utils';
import BaseTrack from './BaseTrack';
import { ChromosomeInfo, chrToAbs } from './chrom-utils';
import { format } from 'd3-format';

function ScannerResultTrack(HGC, ...args) {
  class ScannerResultTrackClass extends BaseTrack(HGC, ...args) {
    constructor(context, options) {
      super(context, options);

      this.valueScaleTransform = HGC.libraries.d3Zoom.zoomIdentity;
      this.HGC = HGC;

      this.trackId = this.id;
      this.viewId = context.viewUid;

      this.mouseClickData = null;

      this.data = [];

      // we scale the entire view up until a certain point
      // at which point we redraw everything to get rid of
      // artifacts
      // this.drawnAtScale keeps track of the scale at which
      // we last rendered everything
      this.drawnAtScale = HGC.libraries.d3Scale.scaleLinear();
      this.visibleSegments = [];

      this.currentYScale = this.HGC.libraries.d3Scale.scaleLinear(
        [0, 1],
        [0, 1],
      );
      this.segmentHeight = 10;

      // graphics for highliting reads under the cursor
      this.mouseOverGraphics = new HGC.libraries.PIXI.Graphics();
      this.loadingText = new HGC.libraries.PIXI.Text('Initializing...', {
        fontSize: '12px',
        fontFamily: 'Arial',
        fill: 'grey',
      });

      this.loadingText.x = 70;
      this.loadingText.y = 0;
      this.loadingText.anchor.x = 0;
      this.loadingText.anchor.y = 0;

      this.chromSizes = {};
      this.chomSizesLoaded = false;
      this.hasRerenderBeenTriggered = false;

      if (options.chromSizesUrl) {
        this.chromSizes[options.chromSizesUrl] =
          this.chromSizes[options.chromSizesUrl] ||
          new Promise((resolve) => {
            ChromosomeInfo(options.chromSizesUrl, resolve);
          });
      }

      this.initTrack();
      this.prevOptions = Object.assign({}, options);

      this.chromSizes[this.options.chromSizesUrl].then((chromInfo) => {
        this.loadingText.text = 'Loading...';
        this.chomSizesLoaded = true;
        this.chromInfo = chromInfo;
        console.log(this.chromInfo, chromInfo);
        if (this.hasRerenderBeenTriggered) {
          this.rerender(options);
        }
      });
    }

    initTrack() {
      this.pForeground.removeChildren();
      this.pForeground.clear();
      this.pForeground.addChild(this.loadingText);
      this.pMain.removeChildren();
      this.pMain.clear();

      this.legendGraphics = new this.HGC.libraries.PIXI.Graphics();
      this.segmentGraphics = new this.HGC.libraries.PIXI.Graphics();
      this.bgGraphics = new this.HGC.libraries.PIXI.Graphics();
      this.pForeground.addChild(this.legendGraphics);
      this.pMain.addChild(this.bgGraphics);
      this.pMain.addChild(this.segmentGraphics);

      this.legendUtils = new LegendUtils(this.HGC, 70, 1);
    }

    rerender(options) {
      this.hasRerenderBeenTriggered = true;
      super.rerender(options);
      this.options = options;
      this.parseData();
      this.updateExistingGraphics();
      this.prevOptions = Object.assign({}, options);
    }

    createLegendGraphics(maxValue) {
      this.legendHeight = this.dimensions[1] - 10;
      this.legendVerticalOffset = 0;
      const trackWidth = this.dimensions[0];
      this.legendUtils.setLegendHeight(this.legendHeight);
      this.legendUtils.resetLegend(this.legendGraphics);
      this.legendUtils.createLegend(
        this.legendGraphics,
        maxValue,
        4,
        this.legendVerticalOffset,
        this.legendHeight,
        false,
        true,
      );

      if (this.options['yAxisLabel'] && this.options['yAxisLabel']['visible']) {
        this.legendUtils.drawAxisLabel(
          this.legendGraphics,
          this.options['yAxisLabel']['text'],
        );
      }

      this.legendUtils.drawHorizontalLines(this.bgGraphics, 0, trackWidth);
    }

    parseData() {
      if (!this.chromInfo) {
        return;
      }
      this.loadingText.text = 'Parsing data...';

      this.data = [];
      console.log(this.chromInfo);

      this.options.data.forEach((d) => {
        const chr = d[0];
        const from = d[1];
        const to = d[2];
        const major_cn = d[3];
        const minor_cn = d[4];
        const total_cn = d[5];
        const rdr = d[6];
        const baf = d[7];
        const cell = d[8];
        const yValue = rdr;
        this.data.push({
          chr: chr,
          from: from,
          to: to,
          major_cn: major_cn,
          minor_cn: minor_cn,
          total_cn: total_cn,
          rdr: rdr,
          baf: baf,
          cell: cell,
          yvalue: yValue,
          fromAbs: chrToAbs(chr, from, this.chromInfo),
          toAbs: chrToAbs(chr, to, this.chromInfo),
        });
      });
      //console.log(this.data);
    }

    updateExistingGraphics() {
      if (!this.chomSizesLoaded) {
        return;
      }
      this.loadingText.text = 'Rendering...';

      //this.segmentGraphics.drawRect(5, 10, 200, 10);
      // this.segmentGraphics.beginFill(0xfff000);
      // const xPos = this._xScale(1255000);
      // const width = this._xScale(1255010) - xPos;
      // this.segmentGraphics.drawRect(xPos, 1, width, 100);
      //console.log(this._xScale.invert(0));

      const fromX = this._xScale.invert(0);
      const toX = this._xScale.invert(this.dimensions[0]);

      const filteredList = this.data.filter(
        (segment) => segment.toAbs >= fromX && segment.fromAbs <= toX,
      );

      let maxValue = 0.0;
      filteredList.forEach((segment) => {
        maxValue = Math.max(maxValue, segment.yvalue);
      });
      //maxValue = 1.1*maxValue;
      if (filteredList.length === 0) {
        maxValue = 1.0;
      }
      this.createLegendGraphics(maxValue);

      this.currentYScale = this.HGC.libraries.d3Scale.scaleLinear(
        [0, maxValue],
        [
          this.legendUtils.currentLegendLevels[4] - this.segmentHeight / 2,
          this.legendUtils.currentLegendLevels[0] - this.segmentHeight / 2,
        ],
      );

      // this.segmentGraphics.removeChildren();
      // this.segmentGraphics.clear();
      this.segmentGraphics.removeChildren();
      this.segmentGraphics.clear();
      this.segmentGraphics.beginFill(this.HGC.utils.colorToHex('#ff0000'));
      filteredList.forEach((segment) => {
        const xPos = this._xScale(segment.fromAbs);
        const width = this._xScale(segment.toAbs) - xPos;
        // this.segmentGraphics.drawRect(xPos, 10, width, 10);
        this.segmentGraphics.drawRect(
          xPos,
          this.currentYScale(segment.yvalue),
          width,
          this.segmentHeight,
        );
      });

      this.loadingText.text = '';
    }

    getMouseOverHtml(trackX, trackY) {
      this.mouseOverGraphics.clear();
      requestAnimationFrame(this.animate);

      const padding = 2;

      const filteredList = this.data.filter(
        (segment) =>
          trackY >= this.currentYScale(segment.yvalue) &&
          trackY <= this.currentYScale(segment.yvalue) + this.segmentHeight &&
          this._xScale(segment.fromAbs) <= trackX + padding &&
          trackX <= this._xScale(segment.toAbs) + padding,
      );

      let mouseOverHtml = ``;

      for (const segment of filteredList) {
        const al = 'style="text-align: left !important;"';
        const als = 'style="text-align: left !important;font-weight: bold;"';

        const borderCss = 'border: 1px solid #333333;';

        mouseOverHtml +=
          `<table style="margin-top:3px;${borderCss}">` +
          `<tr ><td ${als}>Position</td><td ${al}>${segment.chr}: ${format(',')(
            segment.from,
          )} - ${format(',')(segment.to)}</td></tr>` +
          `<tr ><td ${als}>major_cn</td><td ${al}>${segment.major_cn}</td></tr>` +
          `<tr ><td ${als}>minor_cn</td><td ${al}>${segment.minor_cn}</td></tr>` +
          `<tr ><td ${als}>total_cn</td><td ${al}>${segment.total_cn}</td></tr>` +
          `<tr ><td ${als}>rdr</td><td ${al}>${segment.rdr}</td></tr>` +
          `<tr ><td ${als}>baf</td><td ${al}>${segment.baf}</td></tr>` +
          `<tr ><td ${als}>cell</td><td ${al}>${segment.cell}</td></tr>` +
          `</table>`;

          // Highlight segment
          // this.segmentGraphics.beginFill(this.HGC.utils.colorToHex('#fff000'));
          // const xPos = this._xScale(segment.fromAbs);
          // const width = this._xScale(segment.toAbs) - xPos;
          // this.segmentGraphics.drawRect(
          //   xPos,
          //   this.currentYScale(segment.yvalue),
          //   width,
          //   this.segmentHeight,
          // );
      }

      // const fromX = this.drawnAtScale();

      return mouseOverHtml;
    }

    zoomed(newXScale, newYScale) {
      super.zoomed(newXScale, newYScale);

      // if (this.segmentGraphics) {
      //   scaleScalableGraphics(
      //     this.segmentGraphics,
      //     newXScale,
      //     this.drawnAtScale,
      //   );
      // }
      this.updateExistingGraphics();
      this.mouseOverGraphics.clear();
      this.animate();
    }
  }

  return new ScannerResultTrackClass(...args);
}

const icon =
  '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg"> <!-- Created with Method Draw - http://github.com/duopixel/Method-Draw/ --> <g> <title>background</title> <rect fill="#fff" id="canvas_background" height="18" width="18" y="-1" x="-1"/> <g display="none" overflow="visible" y="0" x="0" height="100%" width="100%" id="canvasGrid"> <rect fill="url(#gridpattern)" stroke-width="0" y="0" x="0" height="100%" width="100%"/> </g> </g> <g> <title>Layer 1</title> <rect id="svg_1" height="0.5625" width="2.99997" y="3.21586" x="1.18756" stroke-width="1.5" stroke="#999999" fill="#000"/> <rect id="svg_3" height="0.5625" width="2.99997" y="7.71582" x="6.06252" stroke-width="1.5" stroke="#999999" fill="#000"/> <rect id="svg_4" height="0.5625" width="2.99997" y="3.21586" x="1.18756" stroke-width="1.5" stroke="#999999" fill="#000"/> <rect id="svg_5" height="0.5625" width="2.99997" y="3.90336" x="11.49997" stroke-width="1.5" stroke="#f73500" fill="#000"/> <rect id="svg_6" height="0.5625" width="2.99997" y="7.40333" x="11.62497" stroke-width="1.5" stroke="#999999" fill="#000"/> <rect id="svg_7" height="0.5625" width="2.99997" y="13.90327" x="5.93752" stroke-width="1.5" stroke="#f4f40e" fill="#000"/> </g> </svg>';

ScannerResultTrack.config = {
  type: 'scannerResult',
  datatype: ['vcf'],
  orientation: '1d-horizontal',
  name: 'Gene list Track',
  thumbnail: new DOMParser().parseFromString(icon, 'text/xml').documentElement,
  availableOptions: [
    'showMousePosition',
    'segmentHeight',
    'availableStatistics',
    'activeStatistic',
    'availableMasks',
    'activeMask',
    'includedGenes',
    'infoFields',
    'filter',
    'yValue',
    'significanceTreshold',
    'yAxisLabel',
    'data',
    'chromSizesUrl',
  ],
  defaultOptions: {
    showMousePosition: false,
    segmentHeight: 12,
    infoFields: [],
    filter: [],
    significanceTreshold: 1.301, // -log10(0.05)
    yAxisLabel: {
      visible: true,
      text: '-log10 (p-value)',
    },
  },
  optionsInfo: {},
};

export default ScannerResultTrack;
