import CircuitDefinition from "src/circuit/CircuitDefinition.js"
import CircuitStats from "src/circuit/CircuitStats.js"
import Config from "src/Config.js"
import GateColumn from "src/circuit/GateColumn.js"
import GateDrawParams from "src/ui/GateDrawParams.js"
import Gates from "src/ui/Gates.js"
import MathPainter from "src/ui/MathPainter.js"
import Point from "src/math/Point.js"
import Rect from "src/math/Rect.js"
import Seq from "src/base/Seq.js"
import Util from "src/base/Util.js"

/** @type {!number} */
let CIRCUIT_OP_HORIZONTAL_SPACING = 10;
/** @type {!number} */
let CIRCUIT_OP_LEFT_SPACING = 35;
/** @type {!number} */
let CIRCUIT_OP_RIGHT_SPACING = 5;

class CircuitWidget {
    /**
     *
     * @param {!Rect} area
     * @param {!CircuitDefinition} circuitDefinition
     * @param {?int} compressedColumnIndex
     * @param {undefined|!function(!int) : !string} wireLabeller
     *
     * @property {!Rect} area
     * @property {!CircuitDefinition} circuitDefinition
     * @property {?int} compressedColumnIndex
     * @property {!function(!int) : !string=} wireLabeller
     */
    constructor(area, circuitDefinition, compressedColumnIndex, wireLabeller = CircuitWidget.DEFAULT_WIRE_LABELLER) {
        this.area = area;
        this.circuitDefinition = circuitDefinition;
        this.compressedColumnIndex = compressedColumnIndex;
        this.wireLabeller = wireLabeller;
    }

    /**
     * @param {!Array<!int>|!int} grouping
     * @returns {!function() : !string}
     */
    static makeWireLabeller(grouping) {
        let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if (grouping === 1) {
            return i => alphabet[i];
        }

        if (typeof grouping === 'number') {
            Util.need(grouping >= 1, "grouping >= 1", arguments);
            return i => {
                let g = Math.floor(i / grouping);
                let e = i % grouping;
                return alphabet[g] + (e + 1);
            };
        }

        if (Array.isArray(grouping)) {
            let labels = [];
            for (let g = 0; g < grouping.length; g++) {
                if (grouping[g] === 1) {
                    labels.push(alphabet[g]);
                } else {
                    for (let i = 0; i < grouping[g]; i++) {
                        labels.push(alphabet[g] + (i + 1));
                    }
                }
            }
            return i => labels[i];
        }

        throw "Unrecognized grouping type: " + grouping;
    }


    /**
     * @param {!Rect} drawArea
     */
    updateArea(drawArea) {
        this.area = drawArea;
    }

    /**
     * @returns {!number}
     */
    getWireSpacing() {
        return this.area.h / this.circuitDefinition.numWires;
    }

    /**
     * @param {!int} wireIndex
     * @returns {!Rect}
     */
    wireRect(wireIndex) {
        Util.need(wireIndex >= 0 && wireIndex < this.circuitDefinition.numWires, "wireIndex out of range", arguments);
        let wireHeight = this.getWireSpacing();
        return this.area.skipTop(wireHeight * wireIndex).takeTop(wireHeight);
    }

    /**
     * @param {!Point} p
     * @returns {?int}
     */
    findWireAt(p) {
        if (!this.area.containsPoint(p)) {
            return null;
        }

        return Math.floor((p.y - this.area.y) * this.circuitDefinition.numWires / this.area.h);
    }

    /**
     * @returns {!Array<!string>}}
     */
    getLabels() {
        return range(this.circuitDefinition.numWires).map(this.wireLabeller);
    }

    /**
     * @param {!Point} p
     * @returns {?number}
     * @private
     */
    findContinuousColumnX(p) {
        if (!this.area.containsPoint(p)) {
            return null;
        }

        let s = (CIRCUIT_OP_HORIZONTAL_SPACING + Config.GATE_RADIUS * 2);
        let left = this.area.x + CIRCUIT_OP_LEFT_SPACING - CIRCUIT_OP_HORIZONTAL_SPACING / 2;
        let dg = (p.x - left) / s;
        return dg - 0.5;
    }

    /**
     * @param {!Point} p
     * @returns {?number}
     */
    findOpHalfColumnAt(p) {
        if (!this.area.containsPoint(p)) {
            return null;
        }

        return Math.max(-0.5, Math.round(this.findContinuousColumnX(p) * 2) / 2);
    }

    /**
     * @param {!Point} p
     * @returns {?int}
     */
    findExistingOpColumnAt(p) {
        if (!this.area.containsPoint(p)) {
            return null;
        }

        let x = this.findContinuousColumnX(p);
        let i;
        if (this.compressedColumnIndex === null || x < this.compressedColumnIndex - 0.75) {
            i = Math.round(x);
        } else if (x < this.compressedColumnIndex - 0.25) {
            i = this.compressedColumnIndex;
        } else {
            i = Math.round(x) - 1;
        }

        if (i < 0 || i >= this.circuitDefinition.columns.length) {
            return null;
        }

        return i;
    }

    /**
     * @param {!Hand} hand
     * @returns {?{ col : !number, row : !number, isInsert : !boolean }}
     */
    findModificationIndex(hand) {
        if (hand.pos === null) {
            return null;
        }
        let halfColIndex = this.findOpHalfColumnAt(Util.notNull(hand.pos));
        if (halfColIndex === null) {
            return null;
        }
        let wireIndex = Util.notNull(this.findWireAt(Util.notNull(hand.pos)));
        let colIndex = Math.ceil(halfColIndex);
        let isInsert = Math.abs(halfColIndex % 1) === 0.5;
        if (colIndex >= this.circuitDefinition.columns.length) {
            return {col: colIndex, row: wireIndex, isInsert: isInsert};
        }

        if (!isInsert) {
            let isFree = this.circuitDefinition.columns[colIndex].gates[wireIndex] === null;
            if (hand.heldGates !== null) {
                for (let k = 0; k < hand.heldGates.gates.length; k++) {
                    if (this.circuitDefinition.columns[colIndex].gates[wireIndex + k] !== null) {
                        isFree = false;
                    }
                }
            }
            if (!isFree) {
                let isAfter = hand.pos.x > this.opRect(colIndex).center().x;
                isInsert = true;
                if (isAfter) {
                    colIndex += 1;
                }
            }
        }

        return {col: colIndex, row: wireIndex, isInsert: isInsert};
    }

    /**
     * @param {!int} operationIndex
     * @returns {Rect!}
     */
    opRect(operationIndex) {
        let opWidth = Config.GATE_RADIUS * 2;
        let opSeparation = opWidth + CIRCUIT_OP_HORIZONTAL_SPACING;
        let tweak = 0;
        if (this.compressedColumnIndex !== null && operationIndex === this.compressedColumnIndex) {
            tweak = opSeparation / 2;
        }
        if (this.compressedColumnIndex !== null && operationIndex > this.compressedColumnIndex) {
            tweak = opSeparation;
        }

        let dx = opSeparation * operationIndex - tweak + CIRCUIT_OP_LEFT_SPACING;
        return this.area.withX(this.area.x + dx).withW(opWidth);
    }

    /**
     * @param {!int} wireIndex
     * @param {!int} operationIndex
     */
    gateRect(wireIndex, operationIndex) {
        let op = this.opRect(operationIndex);
        let wire = this.wireRect(wireIndex);
        let r = Rect.centeredSquareWithRadius(
            new Point(op.x + Config.GATE_RADIUS, wire.center().y),
            Config.GATE_RADIUS);
        return new Rect(Math.round(r.x - 0.5) + 0.5, Math.round(r.y - 0.5) + 0.5, Math.round(r.w), Math.round(r.h));
    }

    afterTidyingUp() {
        return this.withCircuit(this.circuitDefinition.withoutEmpties());
    }

    /**
     * @param {!CircuitWidget|*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        if (this === other) {
            return true;
        }
        return other instanceof CircuitWidget &&
            this.area.isEqualTo(other.area) &&
            this.circuitDefinition.isEqualTo(other.circuitDefinition) &&
            this.compressedColumnIndex === other.compressedColumnIndex &&
            Seq.range(this.circuitDefinition.numWires).every(i => this.wireLabeller(i) === other.wireLabeller(i));
    }

    /**
     * @param {!Painter} painter
     * @param {!Hand} hand
     * @param {!CircuitStats} stats
     */
    paint(painter, hand, stats) {
        painter.fillRect(this.area, Config.BACKGROUND_COLOR_CIRCUIT);
        //let states = this.scanStates(stats.time);

        //// Draw labelled wires
        for (let i = 0; i < this.circuitDefinition.numWires; i++) {
            let wireRect = this.wireRect(i);
            let y = Math.round(wireRect.center().y - 0.5) + 0.5;
            painter.printParagraph(this.wireLabeller(i) + ":", wireRect.takeLeft(20), new Point(1, 0.5));
            let x = this.circuitDefinition.wireMeasuredColumns()[i];
            if (x === Infinity) {
                painter.strokeLine(new Point(this.area.x + 25, y), new Point(this.area.right(), y));
            } else {
                x = this.opRect(x).center().x;
                painter.strokeLine(new Point(this.area.x + 25, y), new Point(x, y));
                painter.strokeLine(new Point(x, y-1), new Point(this.area.right(), y-1));
                painter.strokeLine(new Point(x, y+1), new Point(this.area.right(), y+1));
            }

        }

        //this.paintWireProbabilityCurves(painter, hand, stats.time);

        // Draw operations
        for (let i = 0; i < this.circuitDefinition.columns.length; i++) {
            this.drawCircuitOperation(painter, this.circuitDefinition.columns[i], i, hand, stats);
        }
    }

    /**
     * @param {!Painter} painter
     * @param {!GateColumn} gateColumn
     * @param {!int} col
     * @param {!Hand} hand
     * @param {!CircuitStats} stats
     */
    drawCircuitOperation(painter, gateColumn, col, hand, stats) {
        this.drawColumnControlWires(painter, gateColumn, col, stats);

        for (let row = 0; row < this.circuitDefinition.numWires; row++) {
            let r = this.gateRect(row, col);

            if (gateColumn.gates[row] === null) {
                continue;
            }
            /** @type {!Gate} */
            let gate = gateColumn.gates[row];

            let canGrab =
                (new Seq(hand.hoverPoints()).any(pt => r.containsPoint(pt)) && this.compressedColumnIndex === null) ||
                this.compressedColumnIndex === col;
            gate.drawer(new GateDrawParams(painter, false, canGrab, r, gate, stats, {row, col}));
            let isDisabledReason = this.circuitDefinition.gateAtLocIsDisabledReason(new Point(col, row), stats.time);
            if (isDisabledReason !== null) {
                if (canGrab) {
                    painter.ctx.globalAlpha /= 2;
                }
                painter.strokeLine(r.topLeft(), r.bottomRight(), 'orange', 3);
                painter.ctx.globalAlpha /= 2;
                painter.fillRect(r.paddedBy(5), 'yellow');
                painter.ctx.globalAlpha *= 2;
                painter.printParagraph(isDisabledReason, r.paddedBy(5), new Point(0.5, 0.5), 'red');
                if (canGrab) {
                    painter.ctx.globalAlpha *= 2;
                }
            }
        }
    }

    /**
     * @param {!Painter} painter
     * @param {!GateColumn} gateColumn
     * @param {!int} columnIndex
     * @param {!CircuitStats} stats
     */
    drawColumnControlWires(painter, gateColumn, columnIndex, stats) {
        let n = gateColumn.gates.length;
        let gs = gateColumn.gates;

        let hasTwoSwaps = stats.circuitDefinition.colHasPairedSwapGate(columnIndex);

        let canBeControlled =
            i => stats.circuitDefinition.locHasControllableGate(new Point(columnIndex, i));

        let causesSingleWire =
            i => this.circuitDefinition.locStartsSingleControlWire(new Point(columnIndex, i));

        let causesDoubleWire =
            i => this.circuitDefinition.locStartsDoubleControlWire(new Point(columnIndex, i));

        let isMatchedSwap = i =>
            hasTwoSwaps && gs[i] === Gates.Named.Special.SwapHalf;

        let t1 = Seq.range(n).filter(canBeControlled).first(null);
        let t2 = Seq.range(n).filter(canBeControlled).last(null);
        let c1 = Seq.range(n).filter(causesSingleWire).first(null);
        let c2 = Seq.range(n).filter(causesSingleWire).last(null);
        let cc1 = Seq.range(n).filter(causesDoubleWire).first(null);
        let cc2 = Seq.range(n).filter(causesDoubleWire).last(null);
        let s1 = Seq.range(n).filter(isMatchedSwap).first(null);
        let s2 = Seq.range(n).filter(isMatchedSwap).last(null);

        let x = Math.round(this.opRect(columnIndex).center().x - 0.5) + 0.5;
        if (c1 !== null && t1 !== null) {
            let y1 =  this.wireRect(Math.min(t1, c1)).center().y;
            let y2 = this.wireRect(Math.max(t2, c2)).center().y;
            painter.strokeLine(new Point(x,y1), new Point(x, y2));
        }
        if (s1 !== null) {
            let y1 =  this.wireRect(s1).center().y;
            let y2 = this.wireRect(s2).center().y;
            painter.strokeLine(new Point(x,y1), new Point(x, y2));
        }
        if (cc1 !== null && t1 !== null) {
            let y1 =  this.wireRect(Math.min(t1, cc1)).center().y;
            let y2 = this.wireRect(Math.max(t2, cc2)).center().y;
            painter.strokeLine(new Point(x+1, y1), new Point(x+1, y2));
            painter.strokeLine(new Point(x-1, y1), new Point(x-1, y2));
        }
    }

    static _shiftGateAhead(cols, row, oldCol, minCol) {
        let gate = cols[oldCol].gates[row];
        let newCol = Seq.
            range(cols.length).
            skip(minCol).
            skipWhile(c => cols[c].gates[row] !== null).
            first(cols.length);
        return new Seq(cols).
            padded(cols.length + 1, GateColumn.empty(cols[0].gates.length)).
            withTransformedItem(oldCol, c => c.withGatesAdded(row, new GateColumn([null]))).
            withTransformedItem(newCol, c => c.withGatesAdded(row, new GateColumn([gate]))).
            toArray();
    }

    /**
     * @param {!Hand} hand
     * @returns {!CircuitWidget}
     */
    previewDrop(hand) {
        let modificationPoint = this.findModificationIndex(hand);
        if (modificationPoint === null || hand.heldGates === null) {
            return this;
        }
        let addedGateBlock = Util.notNull(hand.heldGates);

        let emptyCol = GateColumn.empty(this.circuitDefinition.numWires);
        let i = modificationPoint.col;
        let isInserting = modificationPoint.isInsert;
        let row = Math.min(
            Math.max(
                modificationPoint.row - hand.heldGatesGrabInset,
                0),
            this.circuitDefinition.numWires - hand.heldGates.gates.length);
        let newCols = new Seq(this.circuitDefinition.columns).
            padded(i, emptyCol).
            ifThen(isInserting, s => s.withInsertedItem(i, emptyCol)).
            padded(i + 1, emptyCol).
            withTransformedItem(i, c => c.withGatesAdded(row, addedGateBlock)).
            toArray();

        let result = this.withCircuit(this.circuitDefinition.withColumns(newCols));
        result.compressedColumnIndex = isInserting ? i : null;
        return result;
    }

    afterDropping(hand) {
        let r = this.previewDrop(hand);
        r.compressedColumnIndex = null;
        return r;
    }

    withCircuit(circuitDefinition) {
        if (circuitDefinition.isEqualTo(this.circuitDefinition)) {
            return this;
        }
        return new CircuitWidget(
            this.area,
            circuitDefinition,
            this.compressedColumnIndex,
            this.wireLabeller);
    }

    withJustEnoughWires(extra = 0) {
        let maxUsedWire = new Seq(this.circuitDefinition.columns).
            map(c => Seq.range(this.circuitDefinition.numWires).filter(i => c.gates[i] !== null).last(0)).
            max(0);
        let desiredWireCount = maxUsedWire + 1 + extra;
        desiredWireCount = Math.min(Config.MAX_WIRE_COUNT, Math.max(Config.MIN_WIRE_COUNT, desiredWireCount));
        return this.withCircuit(this.circuitDefinition.withWireCount(desiredWireCount));
    }

    /**
     * @param {!Hand} hand
     * @param {!boolean} duplicate
     * @returns {!{newCircuit: !CircuitWidget, newHand: !Hand}}
     */
    tryGrab(hand, duplicate=false) {
        if (hand.pos === null) {
            return {newCircuit: this, newHand: hand};
        }

        let possibleCol = this.findExistingOpColumnAt(Util.notNull(hand.pos));
        if (possibleCol === null) {
            return {newCircuit: this, newHand: hand};
        }

        let c = Util.notNull(possibleCol);
        let r = Util.notNull(this.findWireAt(Util.notNull(hand.pos)));
        if (!this.gateRect(r, c).containsPoint(Util.notNull(hand.pos)) || this.circuitDefinition.columns[c].gates[r] === null) {
            return {newCircuit: this, newHand: hand};
        }

        let gate = this.circuitDefinition.columns[c].gates[r];
        let remainingGates = new Seq(this.circuitDefinition.columns[c].gates).toArray();
        if (!duplicate) {
            remainingGates[r] = null;
        }
        let grabbedGates = [gate];

        let grabInset = 0;
        let newCols = new Seq(this.circuitDefinition.columns).
            withOverlayedItem(c, new GateColumn(remainingGates)).
            toArray();
        return {
            newCircuit: new CircuitWidget(
                this.area,
                this.circuitDefinition.withColumns(newCols),
                null,
                this.wireLabeller),
            newHand: hand.withHeldGates(new GateColumn(grabbedGates), grabInset)
        };
    }

    /**
     * @returns {!boolean}
     */
    needsContinuousRedraw() {
        return this.circuitDefinition.isTimeDependent();
    }

    /**
     * Draws a peek gate on each wire at the right-hand side of the circuit.
     *
     * @param {!Painter} painter
     * @param {!CircuitStats} stats
     */
    drawRightHandPeekGates(painter, stats) {
        let n = this.circuitDefinition.columns.length + 1;

        for (let i = 0; i < this.circuitDefinition.numWires; i++) {
            let p = stats.controlledWireProbabilityJustAfter(i, Infinity);
            MathPainter.paintProbabilityBox(painter, p, this.gateRect(i, n));
            let m = stats.densityMatrixAfterIfAvailable([i], Infinity);
            if (m !== undefined) {
                MathPainter.paintBlochSphere(painter, m, this.gateRect(i, n+1));
            }
        }

        let offset = n+2;
        for (let g = 0; g < 3; g++) {
            let d = 1 << g;
            for (let i = 0; i + d <= this.circuitDefinition.numWires; i += d) {
                let m = stats.densityMatrixAfterIfAvailable(Seq.range(d).map(e => e + i).toArray(), Infinity);
                if (m !== undefined) {
                    let topLeft = this.gateRect(i, offset).topLeft();
                    let wh = this.gateRect(i + d - 1, offset).bottom() - topLeft.y;
                    let r = new Rect(topLeft.x, topLeft.y, wh, wh);
                    MathPainter.paintDensityMatrix(painter, m, r);
                }
            }
            offset += d;
        }
    }
}

CircuitWidget.DEFAULT_WIRE_LABELLER = CircuitWidget.makeWireLabeller(1);

export default CircuitWidget;
