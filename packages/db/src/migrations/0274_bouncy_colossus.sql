CREATE TABLE "genesis_projection_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"canonical_system" text DEFAULT 'mycelium' NOT NULL,
	"canonical_id" text NOT NULL,
	"projection_kind" text NOT NULL,
	"local_target_kind" text NOT NULL,
	"local_target_id" text NOT NULL,
	"canonical_version" text,
	"source_hash" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_applied_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "genesis_projection_bindings" ADD CONSTRAINT "genesis_projection_bindings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "genesis_projection_bindings_canonical_uq" ON "genesis_projection_bindings" USING btree ("canonical_system","canonical_id","projection_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "genesis_projection_bindings_local_target_uq" ON "genesis_projection_bindings" USING btree ("company_id","local_target_kind","local_target_id");--> statement-breakpoint
CREATE INDEX "genesis_projection_bindings_company_kind_idx" ON "genesis_projection_bindings" USING btree ("company_id","projection_kind");