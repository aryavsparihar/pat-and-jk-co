import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "pages_blocks_paths" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"artists_heading" varchar DEFAULT 'Artists',
  	"artists_text" varchar DEFAULT 'Show and sell your work through Phulhaar Gallery by PJK.',
  	"artists_link_label" varchar DEFAULT 'Apply as an artist',
  	"partners_heading" varchar DEFAULT 'Partners',
  	"partners_text" varchar DEFAULT 'Curators, interior designers and decorators; designers and engineers; galleries, institutions and businesses.',
  	"partners_link_label" varchar DEFAULT 'Apply as a partner',
  	"sign_in_text" varchar DEFAULT 'Already applied? Sign in to see where your application has got to.',
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_paths" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"artists_heading" varchar DEFAULT 'Artists',
  	"artists_text" varchar DEFAULT 'Show and sell your work through Phulhaar Gallery by PJK.',
  	"artists_link_label" varchar DEFAULT 'Apply as an artist',
  	"partners_heading" varchar DEFAULT 'Partners',
  	"partners_text" varchar DEFAULT 'Curators, interior designers and decorators; designers and engineers; galleries, institutions and businesses.',
  	"partners_link_label" varchar DEFAULT 'Apply as a partner',
  	"sign_in_text" varchar DEFAULT 'Already applied? Sign in to see where your application has got to.',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "pages_blocks_paths" ADD CONSTRAINT "pages_blocks_paths_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_paths" ADD CONSTRAINT "_pages_v_blocks_paths_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_paths_order_idx" ON "pages_blocks_paths" USING btree ("_order");
  CREATE INDEX "pages_blocks_paths_parent_id_idx" ON "pages_blocks_paths" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_paths_path_idx" ON "pages_blocks_paths" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_paths_order_idx" ON "_pages_v_blocks_paths" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_paths_parent_id_idx" ON "_pages_v_blocks_paths" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_paths_path_idx" ON "_pages_v_blocks_paths" USING btree ("_path");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_blocks_paths" CASCADE;
  DROP TABLE "_pages_v_blocks_paths" CASCADE;`)
}
