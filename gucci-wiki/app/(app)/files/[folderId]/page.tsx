import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import FilesPageContent from "../FilesPageContent";

export default async function FilesFolderPage({
  params,
  searchParams,
}: {
  params: Promise<{ folderId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { folderId } = await params;
  const { page } = await searchParams;

  const folder = await prisma.fileFolder.findUnique({ where: { id: folderId }, select: { id: true } });
  if (!folder) notFound();

  return <FilesPageContent folderId={folderId} page={Number(page) || 1} />;
}
