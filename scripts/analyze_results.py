#!/usr/bin/env python3
"""
GiniAI-Sandbox — Post-Simulation Analysis Script
=================================================
Reads CSV exports from Monte Carlo or sensitivity analysis runs
and produces summary statistics, plots, and confidence intervals.

Usage:
    python scripts/analyze_results.py monte_carlo_results.csv
    python scripts/analyze_results.py --sensitivity sensitivity_analysis.csv
    python scripts/analyze_results.py --timeseries monte_carlo_timeseries.csv

Requirements:
    pip install pandas matplotlib scipy
"""

import argparse
import sys
from pathlib import Path

import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend for CI/headless


def analyze_monte_carlo(filepath: str):
    """Analyze Monte Carlo batch results CSV."""
    df = pd.read_csv(filepath)
    print(f"\n{'='*60}")
    print(f"  Monte Carlo Analysis — {len(df)} runs")
    print(f"{'='*60}\n")

    metrics = ['gini', 'meanWealth', 'medianWealth', 'unemploymentRate',
               'gdp', 'satisfaction', 'crimeRate']

    for m in metrics:
        if m not in df.columns:
            continue
        vals = df[m]
        print(f"  {m:>20s}:  μ = {vals.mean():.4f}  σ = {vals.std():.4f}  "
              f"[{vals.min():.4f}, {vals.max():.4f}]  "
              f"95% CI: [{vals.mean() - 1.96*vals.std()/len(vals)**0.5:.4f}, "
              f"{vals.mean() + 1.96*vals.std()/len(vals)**0.5:.4f}]")

    # --- Plots ---
    fig, axes = plt.subplots(2, 2, figsize=(12, 8))
    fig.suptitle('Monte Carlo Results', fontsize=14, fontweight='bold')

    # Gini distribution
    if 'gini' in df.columns:
        axes[0, 0].hist(df['gini'], bins=15, color='#D4A574', edgecolor='#2A2A3E', alpha=0.8)
        axes[0, 0].axvline(df['gini'].mean(), color='#E07A5F', linestyle='--', label=f"μ={df['gini'].mean():.4f}")
        axes[0, 0].set_title('Gini Coefficient Distribution')
        axes[0, 0].set_xlabel('Gini')
        axes[0, 0].legend()

    # Wealth distribution
    if 'meanWealth' in df.columns:
        axes[0, 1].hist(df['meanWealth'], bins=15, color='#81B29A', edgecolor='#2A2A3E', alpha=0.8)
        axes[0, 1].set_title('Mean Wealth Distribution')
        axes[0, 1].set_xlabel('Mean Wealth ($)')

    # Unemployment vs Gini scatter
    if 'unemploymentRate' in df.columns and 'gini' in df.columns:
        axes[1, 0].scatter(df['unemploymentRate'], df['gini'], c='#5B8FB9', alpha=0.6, s=30)
        axes[1, 0].set_title('Unemployment vs Gini')
        axes[1, 0].set_xlabel('Unemployment Rate')
        axes[1, 0].set_ylabel('Gini')

    # GDP vs satisfaction
    if 'gdp' in df.columns and 'satisfaction' in df.columns:
        axes[1, 1].scatter(df['gdp'], df['satisfaction'], c='#D4A574', alpha=0.6, s=30)
        axes[1, 1].set_title('GDP vs Satisfaction')
        axes[1, 1].set_xlabel('GDP')
        axes[1, 1].set_ylabel('Satisfaction')

    plt.tight_layout()
    outpath = filepath.replace('.csv', '_analysis.png')
    plt.savefig(outpath, dpi=150)
    print(f"\n  Plot saved: {outpath}")


def analyze_timeseries(filepath: str):
    """Analyze Monte Carlo time series CSV."""
    df = pd.read_csv(filepath)
    seeds = df['seed'].unique()
    print(f"\n{'='*60}")
    print(f"  Time Series Analysis — {len(seeds)} seeds")
    print(f"{'='*60}\n")

    fig, axes = plt.subplots(2, 2, figsize=(14, 8))
    fig.suptitle('Simulation Trajectories', fontsize=14, fontweight='bold')

    metrics_plot = [
        ('gini', 'Gini Coefficient', '#D4A574'),
        ('meanWealth', 'Mean Wealth ($)', '#81B29A'),
        ('unemploymentRate', 'Unemployment Rate', '#E07A5F'),
        ('satisfaction', 'Satisfaction', '#5B8FB9'),
    ]

    for idx, (col, title, color) in enumerate(metrics_plot):
        ax = axes[idx // 2, idx % 2]
        if col not in df.columns:
            continue

        for seed in seeds:
            subset = df[df['seed'] == seed]
            ax.plot(subset['year'], subset[col], alpha=0.2, color=color, linewidth=0.8)

        # Mean trajectory
        mean_traj = df.groupby('year')[col].mean()
        ax.plot(mean_traj.index, mean_traj.values, color=color, linewidth=2.5, label='Mean')

        # 95% CI band
        std_traj = df.groupby('year')[col].std()
        ax.fill_between(mean_traj.index,
                        mean_traj.values - 1.96 * std_traj.values,
                        mean_traj.values + 1.96 * std_traj.values,
                        alpha=0.15, color=color)

        ax.set_title(title)
        ax.set_xlabel('Year')
        ax.legend()

    plt.tight_layout()
    outpath = filepath.replace('.csv', '_trajectories.png')
    plt.savefig(outpath, dpi=150)
    print(f"  Plot saved: {outpath}")


def analyze_sensitivity(filepath: str):
    """Analyze sensitivity analysis CSV."""
    df = pd.read_csv(filepath)
    params = df['parameter'].unique()
    params = [p for p in params if p != 'BASELINE']

    print(f"\n{'='*60}")
    print(f"  Sensitivity Analysis — {len(params)} parameters")
    print(f"{'='*60}\n")

    baseline = df[df['parameter'] == 'BASELINE'].iloc[0]
    print(f"  Baseline Gini: {baseline['gini']:.4f}")
    print(f"  Baseline GDP:  {baseline['gdp']:.2f}")
    print()

    fig, axes = plt.subplots(len(params), 2, figsize=(12, 3 * len(params)))
    if len(params) == 1:
        axes = axes.reshape(1, -1)
    fig.suptitle('Sensitivity Analysis (OAT)', fontsize=14, fontweight='bold')

    for i, param in enumerate(params):
        subset = df[df['parameter'] == param].sort_values('value')
        values = subset['value'].values

        # Gini response
        axes[i, 0].plot(values, subset['gini'].values, 'o-', color='#D4A574', linewidth=2)
        axes[i, 0].axhline(baseline['gini'], color='#888', linestyle='--', alpha=0.5)
        axes[i, 0].set_ylabel('Gini')
        axes[i, 0].set_title(f'{param} → Gini')

        # GDP response
        axes[i, 1].plot(values, subset['gdp'].values, 's-', color='#81B29A', linewidth=2)
        axes[i, 1].axhline(baseline['gdp'], color='#888', linestyle='--', alpha=0.5)
        axes[i, 1].set_ylabel('GDP')
        axes[i, 1].set_title(f'{param} → GDP')

        # Range annotation
        gini_range = subset['gini'].max() - subset['gini'].min()
        print(f"  {param:>25s}: Gini range = {gini_range:.4f}, "
              f"GDP range = {subset['gdp'].max() - subset['gdp'].min():.2f}")

    plt.tight_layout()
    outpath = filepath.replace('.csv', '_sensitivity.png')
    plt.savefig(outpath, dpi=150)
    print(f"\n  Plot saved: {outpath}")


def main():
    parser = argparse.ArgumentParser(description='GiniAI-Sandbox Analysis Script')
    parser.add_argument('file', help='CSV file to analyze')
    parser.add_argument('--sensitivity', action='store_true', help='Treat as sensitivity analysis CSV')
    parser.add_argument('--timeseries', action='store_true', help='Treat as time series CSV')
    args = parser.parse_args()

    if not Path(args.file).exists():
        print(f"Error: File not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    if args.sensitivity:
        analyze_sensitivity(args.file)
    elif args.timeseries:
        analyze_timeseries(args.file)
    else:
        analyze_monte_carlo(args.file)

    print("\nDone.")


if __name__ == '__main__':
    main()
