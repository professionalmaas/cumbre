"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import {
  rejectReview as qReject,
  refundReview as qRefund,
  dismissReview as qDismiss,
} from "@/lib/queries";

export async function rejectReview(reviewId: string) {
  if (!(await requireAdmin())) throw new Error("forbidden");
  await qReject(reviewId);
  revalidatePath("/admin/review");
}

export async function refundReview(reviewId: string) {
  if (!(await requireAdmin())) throw new Error("forbidden");
  await qRefund(reviewId);
  revalidatePath("/admin/review");
}

export async function dismissReview(reviewId: string) {
  if (!(await requireAdmin())) throw new Error("forbidden");
  await qDismiss(reviewId);
  revalidatePath("/admin/review");
}
