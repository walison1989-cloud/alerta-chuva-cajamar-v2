-- Distributed quota; no user can read counters or choose an identity.
CREATE TABLE public.cotas_geocodificacao (
    chave TEXT NOT NULL, janela TIMESTAMPTZ NOT NULL, contador INTEGER NOT NULL CHECK(contador > 0),
    PRIMARY KEY(chave,janela)
);
CREATE INDEX cotas_geocodificacao_janela ON public.cotas_geocodificacao(janela);
ALTER TABLE public.cotas_geocodificacao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cotas_geocodificacao FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.consumir_cota_geocodificacao() RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE uid UUID := auth.uid(); spec RECORD; updated INTEGER;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'autenticacao_obrigatoria' USING ERRCODE='42501'; END IF;
    DELETE FROM public.cotas_geocodificacao WHERE janela < now() - interval '2 days';
    FOR spec IN SELECT * FROM (VALUES
        ('user-minute:'||uid::text,date_trunc('minute',now()),10),
        ('user-day:'||uid::text,date_trunc('day',now()),100),
        ('global-minute',date_trunc('minute',now()),100),
        ('global-day',date_trunc('day',now()),5000)
    ) AS limits(chave,janela,maximo) LOOP
        updated:=NULL;
        INSERT INTO public.cotas_geocodificacao AS c(chave,janela,contador)
        VALUES(spec.chave,spec.janela,1)
        ON CONFLICT(chave,janela) DO UPDATE SET contador=c.contador+1 WHERE c.contador < spec.maximo
        RETURNING contador INTO updated;
        IF updated IS NULL THEN RETURN FALSE; END IF;
    END LOOP;
    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.consumir_cota_geocodificacao() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consumir_cota_geocodificacao() TO authenticated;
