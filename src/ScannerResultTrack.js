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
      this.snpData = [];

      this.previousFromX = Number.MIN_SAFE_INTEGER;
      this.previousToX = Number.MAX_SAFE_INTEGER;
      this.currentFilteredListSnp = [];
      this.currentFilteredList = [];
      this.currentMaxValue = 0;

      // we scale the entire view up until a certain point
      // at which point we redraw everything to get rid of
      // artifacts
      // this.drawnAtScale keeps track of the scale at which
      // we last rendered everything
      this.drawnAtScale = HGC.libraries.d3Scale.scaleLinear();
      this.visibleSegments = [];

      this.currentYScaleSegments = this.HGC.libraries.d3Scale.scaleLinear(
        [0, 1],
        [0, 1],
      );
      this.currentYScalePoints = this.HGC.libraries.d3Scale.scaleLinear(
        [0, 1],
        [0, 1],
      );

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
      //this.hasRerenderBeenTriggered = false;

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
        //if (this.hasRerenderBeenTriggered) {
        this.rerender(options);
        //}
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

      // setTimeout(() => {
      //   const d = [
      //     ['chr1', 566870, 0.0],
      //     ['chr1', 729679, 1.0],
      //     ['chr1', 752566, 1.0],
      //     ['chr1', 752721, 1.0],
      //     ['chr1', 753541, 1.0],
      //     ['chr1', 754192, 1.0],
      //     ['chr1', 754334, 1.0],
      //     ['chr1', 754503, 1.0],
      //     ['chr1', 750000, 0.5],
      //     ['chr1', 1611995, 0.0],
      //     ['chr1', 1618592, 0.0],
      //     ['chr1', 1618675, 0.0],
      //     ['chr1', 1619848, 0.0],
      //     ['chr1', 1620860, 0.0],
      //     ['chr1', 1620885, 0.0],
      //     ['chr1', 1628197, 0.0],
      //     ['chr1', 1651631, 0.0],
      //     ['chr1', 1655928, 0.0],
      //     ['chr1', 1660978, 0.0],
      //     ['chr1', 1668168, 0.0],
      //     ['chr1', 1672142, 0.0],
      //     ['chr1', 1674111, 0.0],
      //     ['chr1', 1692321, 0.0],
      //     ['chr1', 1694251, 0.0],
      //     ['chr1', 1698092, 0.0],
      //     ['chr1', 1704654, 0.0],
      //     ['chr1', 1718435, 0.0],
      //   ];
      //   this.setSnpData(d);
      // }, 1000);
    }

    setData(data) {
      this.parseData(data);
      this.rerender(this.options);
    }

    setSnpData(data) {
      this.parseSnpData(data);
      this.rerender(this.options);
    }

    rerender(options) {
      super.rerender(options);
      this.options = options;
      if (this.options.data.length > 0) {
        this.parseData(this.options.data);
      }
      this.resetCache();
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

    resetCache(){
      this.previousFromX = Number.MIN_SAFE_INTEGER;
      this.previousToX = Number.MAX_SAFE_INTEGER;
    }

    parseSnpData(data) {
      this.snpData = [];
      if (!this.chromInfo) {
        return;
      }
      this.loadingText.text = 'Parsing data...';

      data.forEach((d) => {
        const chr = d[0];
        const pos = d[1];
        const snp_baf = d[2];

        this.snpData.push({
          chr: chr,
          pos: pos,
          yvalue: snp_baf,
          posAbs: chrToAbs(chr, pos, this.chromInfo),
          importance: Math.random(),
        });
      });
      this.snpData.sort((a, b) => a.importance - b.importance);
      //console.log(this.snpData)
    }

    parseData(data) {
      this.data = [];

      if (!this.chromInfo) {
        return;
      }
      this.loadingText.text = 'Parsing data...';

      data.forEach((d) => {
        const chr = d[0];
        const from = d[1];
        const to = d[2];
        const major_cn = d[3];
        const minor_cn = d[4];
        const total_cn = d[5];
        const rdr = d[6];
        const baf = d[7];
        const cell = d[8];
        let yValue = rdr;
        if (this.options.yValue === 'baf') {
          yValue = baf;
        } else if (this.options.yValue === 'total_cn') {
          yValue = total_cn;
        }
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
      this.loadingText.text = 'Rendering...';

      //this.segmentGraphics.drawRect(5, 10, 200, 10);
      // this.segmentGraphics.beginFill(0xfff000);
      // const xPos = this._xScale(1255000);
      // const width = this._xScale(1255010) - xPos;
      // this.segmentGraphics.drawRect(xPos, 1, width, 100);
      //console.log(this._xScale.invert(0));

      const fromX = this._xScale.invert(0);
      const toX = this._xScale.invert(this.dimensions[0]);
      const refreshStep = 0.05;

      if (
        Math.abs(
          (this.previousFromX - fromX) /
            (this.previousToX - this.previousFromX),
        ) > refreshStep ||
        Math.abs(
          (this.previousToX - toX) / (this.previousToX - this.previousFromX),
        ) > refreshStep
      ) {
        // Recompute
        this.currentFilteredList = this.data.filter(
          (segment) =>
            segment.toAbs >= fromX - refreshStep &&
            segment.fromAbs <= toX + refreshStep,
        );

        this.currentFilteredListSnp = this.snpData
          .filter(
            (segment) =>
              segment.posAbs >= fromX - refreshStep &&
              segment.posAbs <= toX + refreshStep,
          )
          .slice(0, 10000);

        let maxValue = 0.0;
        this.currentFilteredList.forEach((segment) => {
          if (this.options.show_total_cn) {
            maxValue = Math.max(maxValue, segment.yvalue, segment.total_cn);
          } else {
            maxValue = Math.max(maxValue, segment.yvalue);
          }
        });
        //maxValue = 1.1*maxValue;
        if (this.currentFilteredList.length === 0) {
          maxValue = 1.0;
        }

        let maxValueSnp = 0.0;
        this.currentFilteredListSnp.forEach((segment) => {
          maxValueSnp = Math.max(maxValueSnp, segment.yvalue);
        });
        this.currentMaxValue = Math.max(maxValue, maxValueSnp);
        this.previousFromX = fromX;
        this.previousToX = toX;
        //console.log(fromX, this.currentFilteredListSnp.length);
      }

      this.createLegendGraphics(this.currentMaxValue);

      this.currentYScaleSegments = this.HGC.libraries.d3Scale.scaleLinear(
        [0, this.currentMaxValue],
        [
          this.legendUtils.currentLegendLevels[4] -
            this.options.segmentHeight / 2,
          this.legendUtils.currentLegendLevels[0] -
            this.options.segmentHeight / 2,
        ],
      );

      this.currentYScalePoints = this.HGC.libraries.d3Scale.scaleLinear(
        [0, this.currentMaxValue],
        [
          this.legendUtils.currentLegendLevels[4] + 0,
          this.legendUtils.currentLegendLevels[0] + 0,
        ],
      );

      const segmentColorHex = this.HGC.utils.colorToHex(
        this.options.segmentColor,
      );
      const snpColorHex = this.HGC.utils.colorToHex(this.options.snpColor);
      const blackColorHex = this.HGC.utils.colorToHex('#333333');
      this.segmentGraphics.removeChildren();
      this.segmentGraphics.clear();

      this.segmentGraphics.beginFill(snpColorHex, 0.4);
      this.currentFilteredListSnp.forEach((segment) => {
        const xPos = this._xScale(segment.posAbs);

        this.segmentGraphics.drawCircle(
          xPos,
          this.currentYScalePoints(segment.yvalue),
          3,
        );
      });

      this.currentFilteredList.forEach((segment) => {
        const xPos = this._xScale(segment.fromAbs);
        const width = this._xScale(segment.toAbs) - xPos;
        // this.segmentGraphics.drawRect(xPos, 10, width, 10);
        this.segmentGraphics.beginFill(segmentColorHex);
        this.segmentGraphics.drawRect(
          xPos,
          this.currentYScaleSegments(segment.yvalue),
          width,
          this.options.segmentHeight,
        );
        if (this.options.show_total_cn) {
          this.segmentGraphics.beginFill(blackColorHex);
          this.segmentGraphics.drawRect(
            xPos,
            this.currentYScalePoints(segment.total_cn),
            width,
            2,
          );
        }
      });

      this.loadingText.text = '';
    }

    getMouseOverHtml(trackX, trackY) {
      this.mouseOverGraphics.clear();
      requestAnimationFrame(this.animate);

      const padding = 0;

      const filteredList = this.data.filter(
        (segment) =>
          trackY >= this.currentYScaleSegments(segment.yvalue) &&
          trackY <=
            this.currentYScaleSegments(segment.yvalue) + this.options.segmentHeight &&
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
        //   this.currentYScaleSegments(segment.yvalue),
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
    'segmentColor',
    'snpColor',
    'filter',
    'yValue',
    'show_total_cn',
    'yAxisLabel',
    'data',
    'chromSizesUrl',
  ],
  defaultOptions: {
    showMousePosition: false,
    segmentHeight: 12,
    segmentColor: '#000000',
    snpColor: '#efefef',
    yValue: 'rdr',
    show_total_cn: false,
    filter: [],
    data: [],
    yAxisLabel: {
      visible: true,
      text: 'rdr',
    },
  },
  optionsInfo: {},
};

export default ScannerResultTrack;
