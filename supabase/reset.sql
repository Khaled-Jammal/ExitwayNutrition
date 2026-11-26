-- Destructive: clears the product catalog and site image settings.
-- It keeps the tables and their read-only policies intact.
begin;

delete from public.products;

update public.site_settings
set hero_image = null,
    collection_images = '{"hair": null, "vitamins": null, "bodybuilder": null, "otherProducts": null}'::jsonb,
    updated_at = now()
where id = 'main';

insert into public.site_settings (id)
values ('main')
on conflict (id) do nothing;

commit;
