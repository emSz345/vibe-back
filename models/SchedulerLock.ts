import mongoose, { Document, Model } from "mongoose";

export interface ISchedulerLock extends Document {
  name: string;
  isRunning: boolean;
  updatedAt: Date;

  isLocked(): boolean;
}

const SchedulerLockSchema = new mongoose.Schema<ISchedulerLock>({
  name: { type: String, unique: true, required: true },
  isRunning: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
});

// 🔧 MÉTODO (com tipagem correta)
SchedulerLockSchema.methods.isLocked = function (): boolean {
  const limite = new Date(Date.now() - 5 * 60 * 1000); // 5 min
  return this.isRunning && this.updatedAt > limite;
};

const SchedulerLock: Model<ISchedulerLock> =
  mongoose.models.SchedulerLock ||
  mongoose.model<ISchedulerLock>("SchedulerLock", SchedulerLockSchema);

export default SchedulerLock;
