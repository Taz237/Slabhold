/*
 * Same image at its original address. The page's own image lives in
 * app/(app), where Next adds a suffix to the address (route group); this keeps
 * the old address, which links already shared and code that builds it use.
 */
export { default, alt, size, contentType } from "@/app/(app)/u/[username]/cards/[id]/opengraph-image";
