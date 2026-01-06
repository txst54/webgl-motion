import * as path from "path";
import * as fs from "fs";
import glob from "glob";
import { BVHParser, BVHData } from "./bvhParser";

interface MotionData {
  positions: number[][][]; // [frames][joints][3]
  jointNames: string[];
  frameTime: number;
}

export class MotionDataset {
  dataDir: string;
  fileList: string[];
  motionData: Record<string, MotionData>;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.fileList = glob.sync(path.join(dataDir, "**/*.bvh"));
    this.motionData = {};
  }

  async loadAll(): Promise<void> {
    console.log(`Found ${this.fileList.length} BVH files.`);
    for (const filePath of this.fileList) {
      try {
        const data = BVHParser.parse(filePath);
        const positions = this.extractPositions(data);
        this.motionData[filePath] = {
          positions,
          jointNames: data.jointNames,
          frameTime: data.frameTime,
        };
        console.log(`Parsed ${filePath}: ${data.numFrames} frames`);
      } catch (err) {
        console.error(`Failed to parse ${filePath}:`, err);
      }
    }
  }

  extractPositions(data: BVHData): number[][][] {
    const positions: number[][][] = [];
    const { motion, root, jointNames } = data;

    // Basic example: only store root position + offsets
    for (let f = 0; f < data.numFrames; f++) {
      const frame = motion[f];
      const framePositions: number[][] = [];
      let idx = 0;
      for (const jointName of jointNames) {
        const joint = data.jointMap[jointName];
        const offset = joint.offset;
        // Simplified assumption: only using offsets for now
        framePositions.push(offset);
        idx += joint.channels.length;
      }
      positions.push(framePositions);
    }
    return positions;
  }

  getJointNames(): string[] {
    if (Object.keys(this.motionData).length === 0)
      throw new Error("No data loaded yet.");
    return Object.values(this.motionData)[0].jointNames;
  }
}
