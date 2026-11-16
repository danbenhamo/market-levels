using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Media;
using ATAS.Indicators;

namespace MarketLevels;

[DisplayName("Gamma Walls (Put/Call)")]
public class GammaLevels : Indicator
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(15) };

    private readonly ValueDataSeries _put = new("Put Wall");
    private readonly ValueDataSeries _call = new("Call Wall");
    private readonly ValueDataSeries _put2 = new("Put 2");
    private readonly ValueDataSeries _call2 = new("Call 2");

    private decimal _pw, _cw, _pw2, _cw2;   // levels in futures points (offset included)
    private volatile bool _dirty;
    private DateTime _lastFetch = DateTime.MinValue;
    private bool _fetching;

    [Display(GroupName = "Source", Name = "Levels URL", Order = 10)]
    public string Url { get; set; } = "https://raw.githubusercontent.com/danbenhamo/market-levels/main/levels.json";

    [Display(GroupName = "Source", Name = "Symbol (ES or NQ)", Order = 20)]
    public string Symbol { get; set; } = "ES";

    [Display(GroupName = "Source", Name = "Refresh every (minutes)", Order = 30)]
    public int RefreshMinutes { get; set; } = 15;

    [Display(GroupName = "Source", Name = "Extra offset (points)", Order = 40)]
    public decimal ExtraOffset { get; set; } = 0m;

    [Display(GroupName = "Source", Name = "Show secondary levels", Order = 50)]
    public bool ShowSecondary { get; set; } = true;

    [Display(GroupName = "Source", Name = "Last status", Order = 60)]
    public string Status { get; set; } = "not loaded yet";

    public GammaLevels() : base(true)
    {
        DenyToChangePanel = true;
        DataSeries[0].IsHidden = true;

        Style(_put, Colors.Red, 3);
        Style(_call, Colors.LimeGreen, 3);
        Style(_put2, Colors.IndianRed, 1);
        Style(_call2, Colors.MediumSeaGreen, 1);

        DataSeries.Add(_put);
        DataSeries.Add(_call);
        DataSeries.Add(_put2);
        DataSeries.Add(_call2);
    }

    private static void Style(ValueDataSeries s, Color c, int width)
    {
        s.Color = c;
        s.Width = width;
        s.VisualType = VisualMode.Line;
        s.ShowZeroValue = false;
    }

    protected override void OnCalculate(int bar, decimal value)
    {
        if (!_fetching && DateTime.UtcNow - _lastFetch > TimeSpan.FromMinutes(Math.Max(1, RefreshMinutes)))
        {
            _fetching = true;
            _lastFetch = DateTime.UtcNow;
            _ = Task.Run(FetchAsync);
        }

        if (_dirty)
        {
            _dirty = false;
            for (var i = 0; i <= bar; i++) Fill(i);
            RedrawChart();
            return;
        }

        Fill(bar);
    }

    private void Fill(int i)
    {
        _put[i] = _pw;
        _call[i] = _cw;
        _put2[i] = ShowSecondary ? _pw2 : 0m;
        _call2[i] = ShowSecondary ? _cw2 : 0m;
    }

    private async Task FetchAsync()
    {
        try
        {
            var url = Url + (Url.Contains('?') ? "&" : "?") + "t=" + DateTime.UtcNow.Ticks; // bypass cache
            var json = await Http.GetStringAsync(url);
            using var doc = JsonDocument.Parse(json);
            var date = doc.RootElement.TryGetProperty("date", out var d) ? d.GetString() : "?";
            if (!doc.RootElement.TryGetProperty(Symbol.Trim().ToUpperInvariant(), out var s) || s.ValueKind != JsonValueKind.Object)
            {
                Status = $"{date}: no levels for {Symbol} yet";
                return;
            }
            decimal Get(string name) => s.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() + ExtraOffset : 0m;

            _pw = Get("put_wall");
            _cw = Get("call_wall");
            _pw2 = Get("put_2");
            _cw2 = Get("call_2");
            Status = $"{date}: put {_pw:0.##} / call {_cw:0.##} (loaded {DateTime.Now:HH:mm})";
            _dirty = true;
        }
        catch (Exception ex)
        {
            Status = "error: " + ex.Message;
        }
        finally
        {
            _fetching = false;
        }
    }
}
